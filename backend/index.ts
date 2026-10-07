import { router, json, error, requireAuth } from '@appdeploy/sdk';
import { db, storage } from '@appdeploy/sdk';
import { notifySubscribers } from './realtime-subscribers';

type Profile = {
  userId: string;
  name: string;
  age: number;
  gender: string;
  city: string;
  country: string;
  bio: string;
  interests: string[];
  lookingFor: string;
  photo?: string;
  online?: boolean;
  verified?: boolean;
  photoPath?: string;
};
type StoredProfile = Profile & { id: string };
type Like = { fromUserId: string; toProfileId: string; createdAt: number };
type Match = {
  userA: string;
  userB: string;
  profileA: string;
  profileB: string;
  createdAt: number;
};
type Message = { senderId:string; receiverId:string; text:string; createdAt:number; senderRole?:'admin'|'member'; };
const ADMIN_EMAIL = 'ADMIN_EMAIL_PENDING';
function isAdmin(ctx:any){ return String(ctx.user?.email||'').toLowerCase() === ADMIN_EMAIL.toLowerCase(); }

async function findProfileByUserId(
  userId: string
): Promise<StoredProfile | null> {
  const { items } = await db.list<Profile>('profiles', { limit: 100 });
  const found = items.find(x => x.userId === userId);
  return found || null;
}
async function findProfileById(id: string): Promise<StoredProfile | null> {
  const [item] = await db.get<Profile>('profiles', [id]);
  return item ? { ...item, id } : null;
}
async function allProfiles(): Promise<StoredProfile[]> {
  const { items } = await db.list<Profile>('profiles', { limit: 500 });
  return items;
}
async function withPhotoUrls(profiles:StoredProfile[]){
  const paths=profiles.map(p=>p.photoPath).filter((x):x is string=>Boolean(x));
  const urls=paths.length?await storage.url(paths):[];
  const map=new Map(urls.map(x=>[x.path,x.url]));
  return profiles.map(p=>{const {latitude,longitude,...safe}=p as any; return {...safe,photo:p.photoPath?map.get(p.photoPath):p.photo};});
}

async function enrichMatch(m: Match, userId: string) {
  const otherUser = m.userA === userId ? m.userB : m.userA;
  const p = await findProfileByUserId(otherUser);
  return p
    ? { id: m.createdAt + '-' + otherUser, profile: p, createdAt: m.createdAt }
    : null;
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'GET /api/me': [
    requireAuth(),
    async ctx => {
      const p = await findProfileByUserId(ctx.user!.userId);
      const profile = p ? (await withPhotoUrls([p]))[0] : null;
      return json({ profile });
    },
  ],

  'GET /api/profiles': [
    requireAuth(),
    async () => {
      const profiles=(await allProfiles()).filter(p=>p.age>=18).sort((a,b)=>Number(Boolean(b.online))-Number(Boolean(a.online)));
      const visible=await withPhotoUrls(profiles);
      return json({profiles:visible});
    },
  ],

  'GET /api/posts': [
    requireAuth(),
    async () => {
      const {items}=await db.list<any>('posts',{limit:500});
      const sorted=items.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
      const paths=sorted.map(p=>p.photoPath).filter((x):x is string=>Boolean(x));
      const urls=paths.length?await storage.url(paths):[];
      const map=new Map(urls.map(x=>[x.path,x.url]));
      const out=await Promise.all(sorted.map(async p=>{
        const author=await findProfileByUserId(p.userId);
        return author?{...p,id:p.id,photo:p.photoPath?map.get(p.photoPath):undefined,author:(await withPhotoUrls([author]))[0]}:null;
      }));
      return json({posts:out.filter(Boolean)});
    },
  ],

  'POST /api/posts': [
    requireAuth(),
    async ctx => {
      const body=ctx.body as {text?:string;photoData?:string;photoContentType?:string};
      const text=String(body.text||'').trim().slice(0,1000);
      if(!text&&!body.photoData)return error('Post text or photo is required',400);
      let photoPath:string|undefined;
      if(body.photoData){
        const safeType=String(body.photoContentType||'image/jpeg').startsWith('image/')?String(body.photoContentType):'image/jpeg';
        const ext=safeType.split('/')[1]?.replace(/[^a-z0-9]/gi,'')||'jpeg';
        photoPath=`posts/${ctx.user!.userId}/${Date.now()}.${ext}`;
        const ok=await storage.write([{path:photoPath,content:String(body.photoData),contentType:safeType}]);
        if(!ok[0])return error('Could not upload post photo',500);
      }
      const record={userId:ctx.user!.userId,text,photoPath,createdAt:Date.now()};
      const [id]=await db.add('posts',[record]);
      if(!id)return error('Could not create post',500);
      const author=await findProfileByUserId(ctx.user!.userId);
      const photo=photoPath?(await storage.url([photoPath]))[0]?.url:undefined;
      return json({post:{...record,id,photo,author:author?(await withPhotoUrls([author]))[0]:null}});
    },
  ],

  'POST /api/profile': [
    requireAuth(),
    async ctx => {
      const body=ctx.body as Partial<Profile>&{photoData?:string;photoContentType?:string};
      const age=Number(body.age);
      if(!body.name||!age||age<18||!body.city)return error('Name, age 18+ and city are required',400);
      const existing=await findProfileByUserId(ctx.user!.userId);
      let photoPath=existing?.photoPath;
      if(body.photoData){
        const safeType=String(body.photoContentType||'image/jpeg').startsWith('image/')?String(body.photoContentType):'image/jpeg';
        const ext=safeType.split('/')[1]?.replace(/[^a-z0-9]/gi,'')||'jpeg';
        photoPath=`profiles/${ctx.user!.userId}/profile.${ext}`;
        const ok=await storage.write([{path:photoPath,content:String(body.photoData),contentType:safeType}]);
        if(!ok[0])return error('Could not upload profile photo',500);
      }
      const record:Profile={
        userId:ctx.user!.userId,name:String(body.name).slice(0,60),age,gender:String(body.gender||''),city:String(body.city).slice(0,80),country:'Nigeria',
        bio:String(body.bio||'').slice(0,500),interests:Array.isArray(body.interests)?body.interests.slice(0,12).map(String):[],
        lookingFor:String(body.lookingFor||'Dating / connection').slice(0,100),photoPath,online:true,verified:false
      };
      if(existing){
        const [ok]=await db.update('profiles',[{id:existing.id,record}]);
        if(!ok)return error('Could not update profile',500);
        const saved=(await withPhotoUrls([{...record,id:existing.id}]))[0];
        return json({profile:saved});
      }
      const [id]=await db.add('profiles',[record]);
      if(!id)return error('Could not create profile',500);
      const saved=(await withPhotoUrls([{...record,id}]))[0];
      return json({profile:saved});
    },
  ],

  'POST /api/likes': [
    requireAuth(),
    async ctx => {
      const body = ctx.body as { profileId?: string };
      if (!body.profileId) return error('profileId is required', 400);
      const target = await findProfileById(body.profileId);
      const my = await findProfileByUserId(ctx.user!.userId);
      if (!target || !my) return error('Profile not found', 404);
      if (target.userId === ctx.user!.userId)
        return error('You cannot like yourself', 400);
      const { items } = await db.list<Like>('likes', { limit: 500 });
      const already = items.some(
        x =>
          x.fromUserId === ctx.user!.userId && x.toProfileId === body.profileId
      );
      if (!already)
        await db.add('likes', [
          {
            fromUserId: ctx.user!.userId,
            toProfileId: body.profileId,
            createdAt: Date.now(),
          },
        ]);
      const reverse = items.some(
        x => x.fromUserId === target.userId && x.toProfileId === my.id
      );
      if (reverse) {
        const { items: ms } = await db.list<Match>('matches', { limit: 500 });
        const exists = ms.some(
          m =>
            (m.userA === ctx.user!.userId && m.userB === target.userId) ||
            (m.userB === ctx.user!.userId && m.userA === target.userId)
        );
        if (!exists)
          await db.add('matches', [
            {
              userA: ctx.user!.userId,
              userB: target.userId,
              profileA: my.id,
              profileB: target.id,
              createdAt: Date.now(),
            },          ]);
        return json({ matched: true });
      }
      return json({ matched: false });