import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, ws } from './lib/backend';
import {
  Heart,
  MessageCircle,
  Compass,
  UserRound,
  Settings,
  ShieldCheck,
  MapPin,
  SlidersHorizontal,
  ChevronRight,
  LogIn,
  LogOut,
  Bell,
  Search,
  MoreHorizontal,
  X,
  Check,
  Menu,
} from 'lucide-react';

type Post = { id:string; userId:string; text:string; photo?:string; photos?:string[]; createdAt:number; author:Profile; likes?:number; likedByMe?:boolean; comments?:any[] };

type Profile = {
  id: string;
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
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

type Match = { id: string; profile: Profile; createdAt: number };
type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
};

const ADMIN_EMAIL = 'cinddycook@gmail.com';

function isAdminUser(user: any) {
  return String(user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

const demoProfiles: Profile[] = [
  {
    id: 'demo-1',
    userId: 'demo-1',
    name: 'Amara',
    age: 25,
    gender: 'Woman',
    city: 'Lagos',
    country: 'Nigeria',
    bio: 'Good energy, great conversations and a love for discovering new places.',
    interests: ['Music', 'Travel', 'Food'],
    lookingFor: 'Meaningful connection',
    verified: true,
    online: true,
  },
  {
    id: 'demo-2',
    userId: 'demo-2',
    name: 'Daniel',
    age: 28,
    gender: 'Man',
    city: 'Abuja',
    country: 'Nigeria',
    bio: 'Easygoing, ambitious and always ready for a good laugh.',
    interests: ['Fitness', 'Business', 'Movies'],
    lookingFor: 'Dating',
    verified: true,
    online: true,
  },
  {
    id: 'demo-3',
    userId: 'demo-3',
    name: 'Tolu',
    age: 24,
    gender: 'Woman',
    city: 'Port Harcourt',
    country: 'Nigeria',
    bio: 'Creative soul who enjoys food spots, fashion and honest conversations.',
    interests: ['Fashion', 'Food', 'Art'],
    lookingFor: 'Friendship or dating',
    online: false,
  },
  {
    id: 'demo-4',
    userId: 'demo-4',
    name: 'Michael',
    age: 30,
    gender: 'Man',
    city: 'Calabar',
    country: 'Nigeria',
    bio: 'Calabar based. Calm personality, travel lover and tech enthusiast.',
    interests: ['Tech', 'Travel', 'Football'],
    lookingFor: 'Serious relationship',
    verified: true,
    online: true,
  },
  {
    id: 'demo-5',
    userId: 'demo-5',
    name: 'Zainab',
    age: 27,
    gender: 'Woman',
    city: 'Kano',
    country: 'Nigeria',
    bio: 'Positive mindset, books, family and meaningful friendships.',
    interests: ['Books', 'Culture', 'Fitness'],
    lookingFor: 'Meaningful connection',
    verified: true,
    online: true,
  },
  {
    id: 'demo-6',
    userId: 'demo-6',
    name: 'Chris',
    age: 29,
    gender: 'Man',
    city: 'London',
    country: 'United Kingdom',
    bio: 'Nigerian abroad, foodie and weekend explorer.',
    interests: ['Travel', 'Food', 'Music'],
    lookingFor: 'Dating',
    online: true,
  },
];

function go(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function route() {
  return window.location.hash.replace(/^#/, '') || '/';
}
function initials(name: string) {
  return name
    .split(' ')
    .map(x => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function avatarColor(name: string) {
  const colors = [
    '#7c3aed',
    '#0f766e',
    '#db2777',
    '#2563eb',
    '#ea580c',
    '#0891b2',
  ];
  return colors[name.charCodeAt(0) % colors.length];
}

class AppErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean}> {
  state={hasError:false};
  static getDerivedStateFromError(){return {hasError:true};}
  componentDidCatch(error:any){console.error('NaijaConnect render error',error);}
  render(){return this.state.hasError ? <div className="loading-screen"><div className="brand-mark">N</div><h2>NaijaConnect</h2><p>Something went wrong loading the app.</p><button className="primary" onClick={()=>window.location.reload()}>Reload NaijaConnect</button></div> : this.props.children;}
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles);
  const [matches, setMatches] = useState<Match[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [demoInterested, setDemoInterested] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(route());

  const refresh = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const u = await auth.getUser();
      setUser(u);
      const profileUrl = '/api/profiles';
      if (u) {
        const [meResult, peopleResult] = await Promise.allSettled([
          api.get('/api/me'),
          api.get(profileUrl),
        ]);
        if (meResult.status === 'fulfilled') setProfile(meResult.value.data.profile || null);
        if (peopleResult.status === 'fulfilled') {
          const liveProfiles = peopleResult.value.data.profiles || [];
          setProfiles(liveProfiles.length ? liveProfiles : demoProfiles);
        }
        try {
          const postsResponse = await api.get('/api/posts');
          setPosts(postsResponse.data.posts || []);
        } catch (postError:any) {
          setPosts([]);
          setNotice(postError?.message || 'Community posts could not be loaded.');
        }
      }
    } catch (e) {
      setNotice(
        'Some live data could not be loaded yet. Demo profiles remain available.'
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => {
    const syncRoute = () => {
      const next = route();
      setPath(next);
      if (next === '/login' || next === '/') setLoading(false);
    };
    syncRoute();
    refresh(true);
    const initialLoadingTimeout = window.setTimeout(() => setLoading(false), 4000);
    window.addEventListener('hashchange', syncRoute);
    const { data: listener } = auth.onAuthStateChange?.((event, session) => {
      setUser(session?.user ? { ...session.user, userId: session.user.id, name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Member' } : null);
      if (event === 'SIGNED_IN') { window.location.hash = '#/discover'; setPath('/discover'); setNotice('You are signed in successfully.'); }
      else if (event === 'SIGNED_OUT') { window.location.hash = '#/'; setPath('/'); }
      else setPath(route());
      window.setTimeout(() => refresh(false), 0);
    }) || { data: { subscription: null } };
    return () => {
      window.clearTimeout(initialLoadingTimeout);
      window.removeEventListener('hashchange', syncRoute);
      listener?.subscription?.unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 3500);
      return () => clearTimeout(t);
    }
  }, [notice]);

  const signIn = async (email?: string) => {
    try {
      await auth.signIn({ email });
      setNotice('Secure sign-in link sent. Check your inbox to continue.');
      return { ok: true, message: '' };
    } catch (e: any) {
      const message = String(e?.message || '');
      const rateLimited = /rate limit|too many requests|429|over_email_send_rate_limit|over_request_rate_limit/i.test(message);
      const friendly = rateLimited
        ? 'Email sending is temporarily rate-limited. Please wait before requesting another link. You do not need to create another account.'
        : message || 'Sign-in could not be completed. Please try again.';
      setNotice(friendly);
      return { ok: false, message: friendly };
    }
  };
  const signOut = async () => {
    await auth.signOut();
    setUser(null);
    setProfile(null);
    setMatches([]);
    setPosts([]);
    go('/');
  };

  const like = async (id: string) => {
    if (!user) {
      setNotice('Sign in to like and match with people.');
      go('/login');
      return;
    }
    try {
      if (id.startsWith('demo-')) {
        setDemoInterested(old => {
          const next = new Set(old);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        });
        setNotice('❤️ Your interest has been saved.');
        return;
      }
      if (id === user.userId) {
        setNotice('You cannot mark your own profile as interested.');
        return;
      }
      const r = await api.post('/api/likes', { profileId: id });
      setNotice(r.data.matched ? '❤️ It’s a mutual connection!' : '❤️ You’re interested in this profile.');
    } catch (e:any) {
      setNotice(e?.message || 'Could not save your interest. Please try again.');
    }
  };

  const connectToAdmin = async (p: Profile) => {
    try { await api.post('/api/connection-requests', { profileId: p.id, profileName: p.name }); } catch {}
    if (ADMIN_EMAIL === 'ADMIN_EMAIL_PENDING') { setNotice('The admin email still needs to be configured.'); return; }
    const subject = encodeURIComponent(`NaijaConnect connection request: ${p.name}, ${p.age}`);
    const body = encodeURIComponent(`Hello NaijaConnect Admin,\n\nI am interested in connecting with ${p.name}, age ${p.age}, from ${p.city}, ${p.country}.\n\nProfile ID: ${p.id}\n\nPlease help connect us.\n\nThank you.`);
    window.location.href = `mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`;
  };
  const createPost = async (text:string, photosData:string[], photoTypes:string[]) => {
    try {
      const r = await api.post('/api/posts', {text, photosData, photoContentTypes:photoTypes});
      setPosts(old => [r.data.post, ...old]);
      setNotice('Post published.');
    } catch (e:any) {
      setNotice(e?.message || 'Could not publish the post. Please try again.');
    }
  };
  const publicPages = path === '/' || path === '/login' || path.startsWith('/profile/');
  const protectedPage = !publicPages;
  if (loading && path !== '/login' && path !== '/')
    return (
      <div className="loading-screen">
        <div className="brand-mark">N</div>
        <h2>NaijaConnect</h2>
        <p>Getting things ready…</p>
      </div>
    );

  return (
    <AppErrorBoundary>
    <div className="app-shell">
      <Header user={user} profile={profile} signIn={signIn} signOut={signOut} />
      {notice && <div className="toast">{notice}</div>}
      <main className="page-wrap">
        {!user && protectedPage && <Login signIn={signIn} />}
        {user && path === '/' && <Home user={user} signIn={signIn} />}
        {path === '/' && !user && <Home user={user} signIn={signIn} />}
        {path === '/login' && <Login signIn={signIn} />}
        {user && path === '/discover' && <Discover profiles={profiles} onLike={like} interested={demoInterested} />}
        {user && (path === '/posts' || path === '/community') && <Posts posts={posts} onCreatePost={createPost} onLikePost={async(id)=>{try{const r=await api.post('/api/post-likes',{postId:id});setPosts(old=>old.map(p=>p.id===id?{...p,likes:r.data.likes,likedByMe:r.data.liked}:p));}catch{setNotice('Could not update the reaction.');}}} onComment={async(id,text)=>{try{const r=await api.post('/api/post-comments',{postId:id,text});setPosts(old=>old.map(p=>p.id===id?{...p,comments:[...(p.comments||[]),r.data.comment]}:p));}catch{setNotice('Could not add your comment.');}}} />}
        {path.startsWith('/profile/') && (
          <ProfilePage
            id={path.split('/')[2]}
            profiles={profiles}
            user={user}
            onLike={like}
            onConnect={connectToAdmin}
          />
        )}
        {path === '/admin' && isAdminUser(user) && <AdminPage />}
        {path === '/admin-messages' && user && <AdminMessages />}
        {user && path === '/profile' && (
          <MyProfile user={user} profile={profile} onSaved={refresh} />
        )}
        {user && path === '/settings' && <SettingsPage user={user} signOut={signOut} />}
        {path === '/safety' && <SafetyPage />}
      </main>

    </div>
    </AppErrorBoundary>
  );
}

function Header({user,profile,signIn,signOut}:{user:any;profile:Profile|null;signIn:()=>void;signOut:()=>void}) {
  const [open,setOpen]=useState(false);
  const admin=isAdminUser(user);
  return <header className="topbar">
    <button className="brand" onClick={()=>go('/')}><span className="brand-dot">N</span><span><strong>NaijaConnect</strong><small>Meet. Match. Connect.</small></span></button>
    <nav className="desktop-links"><button onClick={()=>go('/discover')}>Discover</button><button onClick={()=>go('/community')}>Community</button><button onClick={()=>go('/profile')}>My Profile</button></nav>
    <div className="top-actions">{user?<><button className="avatar-mini" onClick={()=>go('/profile')}>{profile?.photo?<img src={profile.photo} alt=""/>:initials(profile?.name||user.name||'You')}</button>{admin&&<span className="admin-badge"><ShieldCheck size={14}/> ADMIN</span>}<button className="menu-btn" onClick={()=>setOpen(v=>!v)} aria-label="Open menu"><Menu size={21}/></button></>:<button className="sign-btn" onClick={()=>go('/login')}><LogIn size={17}/> Sign in</button>}</div>
    {open&&user&&<div className="account-menu"><button onClick={()=>{setOpen(false);go('/profile')}}><UserRound size={17}/> My Profile</button><button onClick={()=>{setOpen(false);go('/community')}}><MessageCircle size={17}/> Community</button><button onClick={()=>{setOpen(false);go('/admin-messages')}}><MessageCircle size={17}/> Admin Messages</button>{admin&&<button onClick={()=>{setOpen(false);go('/admin')}}><ShieldCheck size={17}/> Admin Inbox</button>}<button onClick={()=>{setOpen(false);go('/settings')}}><Settings size={17}/> Settings</button><button onClick={()=>{setOpen(false);go('/safety')}}><ShieldCheck size={17}/> Safety</button><button onClick={()=>{setOpen(false);signOut()}}><LogOut size={17}/> Sign out</button></div>}
  </header>;
}

function Home({ user, signIn }: { user: any; signIn: () => void }) {
  return (
    <section className="home-page">
      <div className="hero-card">
        <div className="eyebrow">
          <span className="pulse"></span> NIGERIAN-FIRST CONNECTIONS
        </div>
        <h1>
          Meet someone.          <br />
          <em>Make it real.</em>        </h1>
        <p>
          Connect with Nigerians near you and around the world. Discover people,
          find a mutual match and start a conversation.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={() => user ? go('/discover') : go('/login')}>
            Discover people <ChevronRight size={18} />
          </button>
          {!user && (
            <button className="secondary" onClick={()=>go('/login')}>
              Create your profile
            </button>
          )}
        </div>
        <div className="hero-points">
          <span>
            <ShieldCheck size={17} /> Safety tools
          </span>
          <span>
            <MapPin size={17} /> Nigeria first
          </span>
          <span>
            <MessageCircle size={17} /> Private chat
          </span>
        </div>
      </div>
      <div className="feature-grid">
        <Feature
          icon={<Compass />}
          title="Discover"
          text="Browse profiles by city, age and interests."
          action={() => go('/discover')}
        />
        <Feature
          icon={<Heart />}
          title="Interested"
          text="Show interest in profiles you like."
          action={() => go('/discover')}
        />
        <Feature
          icon={<MessageCircle />}
          title="Message"
          text="Contact the NaijaConnect admin for an introduction."
          action={() => go('/discover')}
        />
        <Feature
          icon={<ShieldCheck />}
          title="Stay safe"
          text="Block, report and control your privacy."
          action={() => go('/safety')}
        />
      </div>
      <div className="country-strip">
        <strong>Nigeria</strong>
        <span>•</span>
        <span>Worldwide discovery</span>
        <span>•</span>
        <span>18+ only</span>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  text,
  action,
}: {
  icon: any;
  title: string;
  text: string;
  action: () => void;
}) {
  return (
    <button className="feature-card" onClick={action}>
      <span className="feature-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ChevronRight />
    </button>
  );
}

function Login({ signIn }: { signIn: (email?: string) => Promise<{ok:boolean;message:string}> }) {
  const [email,setEmail]=useState('');
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [cooldown,setCooldown]=useState(()=>{
    try { return Math.max(0, Math.ceil((Number(sessionStorage.getItem('naija_connect_auth_cooldown')||0)-Date.now())/1000)); }
    catch { return 0; }
  });
  useEffect(()=>{
    if(cooldown<=0)return;
    const t=window.setInterval(()=>setCooldown(v=>{
      const next=Math.max(0,v-1);
      if(next===0){try{sessionStorage.removeItem('naija_connect_auth_cooldown')}catch{}}
      return next;
    }),1000);
    return()=>window.clearInterval(t);
  },[cooldown]);
  const submit=async()=>{
    const clean=email.trim();
    if(!/^\S+@\S+\.\S+$/.test(clean)||busy||cooldown>0)return;
    setBusy(true); setError('');
    try{
      const result=await signIn(clean);
      if(result.ok){
        setSent(true);
        const until=Date.now()+60000;
        setCooldown(60);
        try{sessionStorage.setItem('naija_connect_auth_cooldown',String(until))}catch{}
      } else {
        setError(result.message);
        if(/rate limit|too many requests|429|over_email_send_rate_limit|over_request_rate_limit/i.test(result.message)){
          const until=Date.now()+60000;
          setCooldown(60);
          try{sessionStorage.setItem('naija_connect_auth_cooldown',String(until))}catch{}
        }
      }
    } catch(e:any) {
      setError(e?.message||'Sign-in could not be completed. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <section className="center-page">
      <div className="auth-card auth-card-professional">
        <div className="brand-large">N</div>
        <span className="eyebrow auth-eyebrow">SECURE MEMBER ACCESS</span>
        <h1>Welcome to NaijaConnect</h1>
        <p>Sign in with your email. We’ll send you a secure one-time link — no password to remember.</p>
        {error && <div className="auth-error" role="alert"><strong>We couldn't send the link.</strong><span>{error}</span></div>}
        {!sent ? <>
          <label className="email-field"><span>Email address</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();}} placeholder="you@example.com" autoComplete="email"/></label>
          <button type="button" className="primary full auth-submit" disabled={busy||cooldown>0||!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={submit}>
            {busy ? 'Sending secure link…' : cooldown>0 ? `Please wait ${cooldown}s` : <><LogIn size={18}/> Send secure sign-in link</>}
          </button>
        </> : <div className="email-sent">
          <div className="email-sent-icon">✓</div><strong>Check your email</strong>
          <p>We sent a secure NaijaConnect sign-in link to <b>{email}</b>.</p>
          <p className="auth-help">If you do not receive it, check Spam/Junk. Avoid repeatedly requesting links because email providers enforce sending limits.</p>
          <button type="button" className="secondary full" disabled={cooldown>0} onClick={()=>setSent(false)}>{cooldown>0?`Try again in ${cooldown}s`:'Use a different email'}</button>
        </div>}
        <div className="auth-security"><ShieldCheck size={16}/><span>Your email is used only for account access.</span></div>
        <small className="legal">By continuing, you confirm that you are 18 or older and agree to use the platform respectfully.</small>
      </div>
    </section>
  );
}


export default App;
