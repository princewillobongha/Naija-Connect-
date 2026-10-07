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
function isPasswordRecovery() {
  return new URLSearchParams(window.location.search).get('reset') === '1'
    || window.location.hash.includes('access_token=')
    || window.location.hash.includes('type=recovery');
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
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState(route());

  const refresh = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const u = await auth.getUser();
      setUser(u);
      if (u) {
        const [meResult, peopleResult] = await Promise.allSettled([api.get('/api/me'), api.get('/api/profiles')]);
        if (meResult.status === 'fulfilled') setProfile(meResult.value.data.profile || null);
        if (peopleResult.status === 'fulfilled') {
          const liveProfiles = peopleResult.value.data.profiles || [];
          setProfiles(liveProfiles.length ? liveProfiles : demoProfiles);
        }
        try {
          const likesResponse = await api.get('/api/likes/me');
          setInterestedIds(new Set((likesResponse.data.likes || []).map((x:any)=>x.profile_id)));
        } catch { setInterestedIds(new Set()); }
        try {
          const postsResponse = await api.get('/api/posts');
          setPosts(postsResponse.data.posts || []);
        } catch (postError:any) {
          setPosts([]);
          setNotice(postError?.message || 'Community posts could not be loaded.');
        }
      }
    } catch {
      setNotice('Some live data could not be loaded yet. Demo profiles remain available.');
    } finally { if (showLoading) setLoading(false); }
  };

  useEffect(() => {
    const syncRoute = () => {
      const next = route();
      if (isPasswordRecovery()) {
        setPath('/reset-password');
        setLoading(false);
        return;
      }
      if (next === '/community' || next === '/posts') {
        window.location.hash = '#/discover';
        setPath('/discover');
        setLoading(false);
        return;
      }
      setPath(next);
      if (next === '/login' || next === '/') setLoading(false);
    };
    syncRoute();
    refresh(true);
    const timeout = window.setTimeout(() => setLoading(false), 4000);
    window.addEventListener('hashchange', syncRoute);
    const { data: listener } = auth.onAuthStateChange?.((event, session) => {
      setUser(session?.user ? { ...session.user, userId: session.user.id, name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Member' } : null);
      if (event === 'PASSWORD_RECOVERY' || isPasswordRecovery()) { setPath('/reset-password'); }
      else if (event === 'SIGNED_IN') { window.location.hash = '#/discover'; setPath('/discover'); setNotice('You are signed in successfully.'); }
      else if (event === 'SIGNED_OUT') { window.location.hash = '#/'; setPath('/'); }
      else setPath(route());
      window.setTimeout(() => refresh(false), 0);
    }) || { data: { subscription: null } };
    return () => { window.clearTimeout(timeout); window.removeEventListener('hashchange', syncRoute); listener?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (notice) { const t = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(t); }
  }, [notice]);

  const signIn = async (email?: string, password?: string) => {
    try { await auth.signInWithPassword(String(email || ''), String(password || '')); setNotice('You are signed in successfully.'); return { ok: true, message: '' }; }
    catch (e: any) {
      const raw = String(e?.message || 'Sign-in could not be completed.');
      const message = /invalid login credentials|invalid credentials/i.test(raw)
        ? 'Invalid email or password. If you already have an account, use Forgot password? to set a new password.'
        : raw;
      setNotice(message);
      return { ok: false, message };
    }
  };
  const signUp = async (email: string, password: string) => {
    try {
      const data = await auth.signUpWithPassword(email, password);
      if (data?.session) {
        setNotice('Account created successfully. You are now signed in.');
        window.location.hash = '#/discover';
        setPath('/discover');
        return { ok: true, message: '' };
      }
      const message = 'Account creation needs email confirmation before you can sign in. Please check your email.';
      setNotice(message);
      return { ok: false, message };
    } catch (e: any) {
      const raw = String(e?.message || '');
      const message = /already registered|already exists|user already/i.test(raw)
        ? 'This email is already registered. Tap Sign in, then use Forgot password? if you do not remember the password.'
        : /invalid.*email|email.*invalid/i.test(raw)
          ? 'Please enter a valid email address.'
          : /password.*(weak|short)|weak password|password should/i.test(raw)
            ? 'Choose a stronger password with at least 8 characters.'
            : raw || 'Account creation could not be completed.';
      setNotice(message);
      return { ok: false, message };
    }
  };

  const signOut = async () => { await auth.signOut(); setUser(null); setProfile(null); setMatches([]); setPosts([]); go('/'); };
  const like = async (id: string) => {
    if (!user) { setNotice('Sign in to mark profiles as interested.'); go('/login'); return; }
    try {
      if (id.startsWith('demo-')) { setDemoInterested(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setNotice('❤️ Interest updated.'); return; }
      if (id === user.userId) { setNotice('You cannot mark your own profile as interested.'); return; }
      const r = await api.post('/api/likes', { profileId: id });
      setInterestedIds(old => { const next = new Set(old); if (r.data.liked) next.add(id); else next.delete(id); return next; });
      setNotice(r.data.liked ? '❤️ Added to your Interested profiles.' : 'Interest removed.');
    } catch (e:any) { setNotice(e?.message || 'Could not save your interest. Please try again.'); }
  };
  const connectToAdmin = async (p: Profile) => {
    try {
      await api.post('/api/connection-requests', { profileId: p.id, profileName: p.name });
      const subject = 'NaijaConnect Introduction Request';
      const memberName = profile?.name || user?.name || user?.email?.split('@')[0] || 'NaijaConnect member';
      const body = [
        'Hello NaijaConnect Admin,',
        '',
        'I would like to request an introduction to ' + p.name + '.',
        '',
        'My name: ' + memberName,
        'My email: ' + (user?.email || ''),
        '',
        'Please assist with the introduction through NaijaConnect.',
        '',
        'Kind regards,',
        memberName
      ].join('\n');
      setNotice('Introduction request prepared. Opening your email app…');
      window.location.href = 'mailto:' + ADMIN_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    } catch (e:any) {
      setNotice(e?.message || 'Could not send the connection request.');
    }
  };
  const createPost = async (text:string, photosData:string[], photoTypes:string[]) => {
    try { const r = await api.post('/api/posts', {text, photosData, photoContentTypes:photoTypes}); setPosts(old => [r.data.post, ...old]); setNotice('Post published.'); }
    catch (e:any) { setNotice(e?.message || 'Could not publish the post. Please try again.'); }
  };
  const publicPages = path === '/' || path === '/login' || path === '/reset-password' || path.startsWith('/profile/');
  const protectedPage = !publicPages;
  if (loading && path !== '/login' && path !== '/') return <div className="loading-screen"><div className="brand-mark">N</div><h2>NaijaConnect</h2><p>Getting things ready…</p></div>;
  return <AppErrorBoundary><div className="app-shell"><Header user={user} profile={profile} signIn={signIn} signOut={signOut} />{notice && <div className="toast">{notice}</div>}<main className="page-wrap">
    {!user && protectedPage && <Login signIn={signIn} signUp={signUp} />}
    {isPasswordRecovery() && path === '/reset-password' && <ResetPassword />}
    {user && path === '/' && <Home user={user} signIn={signIn} />}
    {path === '/' && !user && <Home user={user} signIn={signIn} />}
    {path === '/login' && <Login signIn={signIn} signUp={signUp} />}
    {user && path === '/discover' && <Discover profiles={profiles} onLike={like} interested={interestedIds} />}
    {user && path === '/interested' && <InterestedPage profiles={profiles} interested={interestedIds} onLike={like} demoInterested={demoInterested} />}
    {user && (path === '/posts' || path === '/community') && <Discover profiles={profiles} onLike={like} interested={demoInterested} />}

    {path.startsWith('/profile/') && <ProfilePage id={path.split('/')[2]} profiles={profiles} user={user} onLike={like} onConnect={connectToAdmin} />}
    {path === '/admin' && isAdminUser(user) && <AdminPage />}
    {path === '/admin-messages' && user && <AdminMessages />}
    {user && path === '/profile' && <MyProfile user={user} profile={profile} onSaved={refresh} />}
    {user && path === '/settings' && <SettingsPage user={user} signOut={signOut} />}
    {path === '/safety' && <SafetyPage />}
  </main></div></AppErrorBoundary>;
}

function ResetPassword() {
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [done,setDone]=useState(false);
  const submit=async()=>{
    setError('');
    if(password.length<8){setError('Password must be at least 8 characters.');return;}
    if(password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);
    try{ await auth.updatePassword(password); setDone(true); }
    catch(e:any){setError(String(e?.message||'Could not update your password. Please request a new reset link.')); }
    finally{setBusy(false);}
  };
  return <section className="center-page"><div className="auth-card auth-card-professional">
    <div className="brand-large">N</div><span className="eyebrow auth-eyebrow">PASSWORD RECOVERY</span>
    <h1>{done?'Password updated':'Set a new password'}</h1>
    <p>{done?'Your new password is saved. Use it to sign in to NaijaConnect.':'Set a new password for your NaijaConnect account, then use it to sign in.'}</p>
    {!done && <><label className="email-field"><span>New password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters"/></label><label className="email-field"><span>Confirm password</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Enter it again"/></label>{error&&<div className="auth-error" role="alert"><span>{error}</span></div>}<button className="primary full auth-submit" disabled={busy} onClick={submit}>{busy?'Updating…':'Update password'}</button></>}
    {done&&<button className="primary full" onClick={()=>{window.history.replaceState({},'',window.location.origin);window.location.hash='#/login';window.location.reload();}}>Go to sign in</button>}
  </div></section>;
}

function Header({user,profile,signIn,signOut}:{user:any;profile:Profile|null;signIn:()=>void;signOut:()=>void}) {
  const [open,setOpen]=useState(false);
  const [hasAdminMessage,setHasAdminMessage]=useState(false);
  const admin=isAdminUser(user);
  useEffect(()=>{
    let alive=true;
    if(!user || admin){ setHasAdminMessage(false); return ()=>{alive=false;}; }
    api.get('/api/admin/messages').then((r:any)=>{
      if(alive) setHasAdminMessage((r.data.messages||[]).some((m:any)=>m.senderType==='admin'));
    }).catch(()=>{ if(alive) setHasAdminMessage(false); });
    return ()=>{alive=false;};
  },[user?.userId,admin]);
  return <header className="topbar">
    <button className="brand" onClick={()=>go('/')}><span className="brand-dot">N</span><span><strong>NaijaConnect</strong><small>Meet. Match. Connect.</small></span></button>
    <nav className="desktop-links"><button onClick={()=>go('/discover')}>Discover</button><button onClick={()=>go('/profile')}>My Profile</button></nav>
    <div className="top-actions">{user?<><button className="avatar-mini" onClick={()=>go('/profile')}>{profile?.photo?<img src={profile.photo} alt=""/>:initials(profile?.name||user.name||'You')}</button>{admin&&<span className="admin-badge"><ShieldCheck size={14}/> ADMIN</span>}<button className="menu-btn" onClick={()=>setOpen(v=>!v)} aria-label="Open menu"><Menu size={21}/></button></>:<button className="sign-btn" onClick={()=>go('/login')}><LogIn size={17}/> Sign in</button>}</div>
    {open&&user&&<div className="account-menu"><button onClick={()=>{setOpen(false);go('/profile')}}><UserRound size={17}/> My Profile</button><button onClick={()=>{setOpen(false);go('/interested')}}><Heart size={17}/> Interested</button>{hasAdminMessage&&<button onClick={()=>{setOpen(false);go('/admin-messages')}}><MessageCircle size={17}/> Admin Messages</button>}{admin&&<button onClick={()=>{setOpen(false);go('/admin')}}><ShieldCheck size={17}/> Admin Inbox</button>}<button onClick={()=>{setOpen(false);go('/settings')}}><Settings size={17}/> Settings</button><button onClick={()=>{setOpen(false);go('/safety')}}><ShieldCheck size={17}/> Safety</button><button onClick={()=>{setOpen(false);signOut()}}><LogOut size={17}/> Sign out</button></div>}
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

function Login({ signIn, signUp }: { signIn: (email?: string, password?: string) => Promise<{ok:boolean;message:string}>; signUp: (email:string,password:string) => Promise<{ok:boolean;message:string}> }) {
  const [mode,setMode]=useState<'signin'|'signup'|'forgot'>('signin');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sent,setSent]=useState(false);

  const submit=async()=>{
    const clean=email.trim();
    setError('');
    if(!/^\S+@\S+\.\S+$/.test(clean)){setError('Enter a valid email address.');return;}
    if(mode!=='forgot' && password.length<8){setError('Password must be at least 8 characters.');return;}
    if(mode==='signup' && password!==confirm){setError('Passwords do not match.');return;}
    if(busy)return;
    setBusy(true);
    try{
      if(mode==='forgot'){
        await auth.requestPasswordReset(clean, window.location.origin + '/?reset=1');
        setSent(true);
        return;
      }
      const result = mode==='signin' ? await signIn(clean,password) : await signUp(clean,password);
      if(!result.ok) setError(result.message);
    } finally { setBusy(false); }
  };

  if(mode==='forgot') return (
    <section className="center-page"><div className="auth-card auth-card-professional">
      <div className="brand-large">N</div><span className="eyebrow auth-eyebrow">PASSWORD RECOVERY</span>
      <h1>Reset your password</h1>
      <p>{sent ? 'Check your email for the secure reset link. Open it, set a new password, then use that new password to sign in.' : 'Enter your account email and we will send you a secure reset link.'}</p>
      {!sent && <><label className="email-field"><span>Email address</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label>
      {error && <div className="auth-error" role="alert"><span>{error}</span></div>}
      <button type="button" className="primary full auth-submit" disabled={busy} onClick={submit}>{busy?'Sending…':'Send reset link'}</button></>}
      <button type="button" className="secondary full" onClick={()=>{setMode('signin');setError('');setSent(false);}}>Back to sign in</button>
    </div></section>
  );

  return (
    <section className="center-page"><div className="auth-card auth-card-professional">
      <div className="brand-large">N</div><span className="eyebrow auth-eyebrow">SECURE MEMBER ACCESS</span>
      <h1>{mode==='signin'?'Welcome back':'Create your NaijaConnect account'}</h1>
      <p>{mode==='signin'?'Sign in with your email and password.':'Create a secure account with your email and password.'}</p>
      {error && <div className="auth-error" role="alert"><strong>We couldn't complete that.</strong><span>{error}</span></div>}
      <label className="email-field"><span>Email address</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label>
      <label className="email-field"><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();}} placeholder="At least 8 characters" autoComplete={mode==='signin'?'current-password':'new-password'}/></label>
      {mode==='signin' && <button type="button" className="text-button" onClick={()=>{setMode('forgot');setError('');}}>Forgot password?</button>}
      {mode==='signup' && <label className="email-field"><span>Confirm password</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();}} placeholder="Enter your password again" autoComplete="new-password"/></label>}
      <button type="button" className="primary full auth-submit" disabled={busy} onClick={submit}>{busy ? (mode==='signin'?'Signing in…':'Creating account…') : (mode==='signin'?<><LogIn size={18}/> Sign in</>:<>Create account <ChevronRight size={18}/></>)}</button>
      <button type="button" className="secondary full" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');}}>{mode==='signin'?'New to NaijaConnect? Create an account':'Already have an account? Sign in'}</button>
      <div className="auth-security"><ShieldCheck size={16}/><span>Your password is securely handled by Supabase Auth.</span></div>
      <small className="legal">By continuing, you confirm that you are 18 or older and agree to use the platform respectfully.</small>
    </div></section>
  );
}

function Discover({profiles,onLike,interested}:{profiles:Profile[],onLike:(id:string)=>void,interested?:Set<string>}){
  const [city,setCity]=useState('All Nigeria'); const [gender,setGender]=useState('Everyone'); const [maxAge,setMaxAge]=useState(45); const [query,setQuery]=useState('');
  const nearby=false;
  const filtered=useMemo(()=>profiles.filter(p=>
    p && Array.isArray(p.interests) &&
    (!nearby || p.distanceKm !== undefined) &&
    (city==='All Nigeria' ? p.country==='Nigeria' : city==='Worldwide' || city==='Nearby' ? true : p.city===city) &&
    (gender==='Everyone'||p.gender===gender) && p.age<=maxAge &&
    (!query || (p.name+' '+p.city+' '+p.interests.join(' ')).toLowerCase().includes(query.toLowerCase()))
  ),[profiles,city,gender,maxAge,query,nearby]);
  return <section className="content-page">
    <div className="page-heading"><div><span className="eyebrow">DISCOVER</span><h1>People</h1><p>Browse member profiles. Everyone with an account can discover new members.</p></div><button className="outline-btn" onClick={()=>go('/settings')}><SlidersHorizontal size={17}/> Preferences</button></div>
    <div className="filter-panel"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, city or interest"/></label><select value={city} onChange={e=>setCity(e.target.value)}><option>All Nigeria</option><option>Lagos</option><option>Abuja</option><option>Port Harcourt</option><option>Calabar</option><option>Kano</option><option>Worldwide</option></select><select value={gender} onChange={e=>setGender(e.target.value)}><option>Everyone</option><option>Woman</option><option>Man</option></select><select value={maxAge} onChange={e=>setMaxAge(Number(e.target.value))}><option value="25">18–25</option><option value="35">18–35</option><option value="45">18–45</option><option value="60">18–60</option></select></div>
      <div className="profile-grid">{filtered.map(p=><ProfileCard key={p.id} p={p} onLike={onLike} interested={interested?.has(p.id) || false}/>)}{!filtered.length&&<Empty title="No people found" text="Try widening your filters or exploring worldwide."/>}</div>
  </section>
}

function ProfileCard({p,onLike,interested}:{p:Profile,onLike:(id:string)=>void,interested?:boolean}){
  return <article className="profile-card">
    <button className="profile-photo" onClick={()=>go('/profile/'+p.id)}>{p.photo?<img src={p.photo} alt={p.name}/>:<span style={{background:avatarColor(p.name)}}>{initials(p.name)}</span>}<i className={p.online?'online':''}></i></button>
    <div className="profile-card-body"><button className="profile-name" onClick={()=>go('/profile/'+p.id)}>{p.name}, {p.age} {p.verified&&<ShieldCheck size={15}/>}</button><span className="location"><MapPin size={14}/>{p.distanceKm!==undefined?`${p.distanceKm.toFixed(1)} km away`:`${p.city}, ${p.country}`}</span><p>{p.bio}</p><div className="tags">{p.interests.slice(0,3).map(x=><span key={x}>{x}</span>)}</div><div className="card-actions"><button className={interested?'like-btn active':'like-btn'} onClick={()=>onLike(p.id)}><Heart size={17} fill={interested?'currentColor':'none'}/> {interested?'Interested':'Interested'}</button><button className="more-btn" onClick={()=>go('/profile/'+p.id)}>View profile <ChevronRight size={16}/></button></div></div>
  </article>
}

function ProfilePage({id,profiles,user,onLike,onConnect}:{id:string,profiles:Profile[],user:any,onLike:(id:string)=>void,onConnect:(p:Profile)=>void}){
  const p=profiles.find(x=>x.id===id)||demoProfiles.find(x=>x.id===id);
  const own=!!user&&p?.id===user.userId;
  const [menu,setMenu]=useState(false);
  if(!p)return <Empty title="Profile not found" text="This profile may have been removed." action={()=>go('/discover')} actionText="Back to discover"/>;
  const share=async()=>{try{if(navigator.share) await navigator.share({title:'NaijaConnect profile',text:'Check out '+p.name+' on NaijaConnect.',url:window.location.href});else await navigator.clipboard.writeText(window.location.href);setMenu(false);}catch{}};
  return <section className="detail-page"><button className="back-link" onClick={()=>go('/discover')}>← Back to discover</button><div className="profile-detail">
    <div className="detail-photo">{p.photo?<img src={p.photo} alt={p.name}/>:<span style={{background:avatarColor(p.name)}}>{initials(p.name)}</span>}</div>
    <div className="detail-copy">
      <div className="detail-topline"><div><div className="eyebrow">{p.online?'ONLINE NOW':'PROFILE'} {p.verified&&' • VERIFIED'}</div><h1>{p.name}</h1><div className="detail-age">{p.age} years old</div></div><div className="profile-more-wrap"><button className="icon-square" onClick={()=>setMenu(v=>!v)} aria-label="More profile options"><MoreHorizontal/></button>{menu&&<div className="profile-more-menu"><button onClick={share}>Share profile</button><button onClick={()=>{setMenu(false);go('/safety')}}>Safety & report</button></div>}</div></div>
      <div className="detail-location"><MapPin size={18}/>{p.city}, {p.country}</div>
      <p className="big-bio">{p.bio||'This member has not added a bio yet.'}</p>
      <div className="detail-section"><h3>About</h3><p>{p.city}, {p.country}</p></div>
      {p.interests.length>0&&<div className="detail-section"><h3>Interests</h3><div className="tags large">{p.interests.map(x=><span key={x}>{x}</span>)}</div></div>}
      <div className="detail-section"><h3>Looking for</h3><p>{p.lookingFor}</p></div>
      {!own&&<div className="detail-actions"><button className="primary" onClick={()=>onConnect(p)}><MessageCircle size={18}/> Connect</button><button className="secondary" onClick={()=>onLike(p.id)}><Heart size={18} fill="currentColor"/> Interested</button></div>}
      
      {own&&<button className="primary" onClick={()=>go('/profile')}>Edit my profile</button>}
    </div>
  </div></section>
}
function InterestedPage({profiles,interested,onLike,demoInterested}:{profiles:Profile[],interested:Set<string>,onLike:(id:string)=>void,demoInterested:Set<string>}) {
  const items=profiles.filter(p=>interested.has(p.id)||demoInterested.has(p.id));
  return <section className="content-page">
    <div className="page-heading"><div><span className="eyebrow">INTERESTED</span><h1>Profiles you’re interested in</h1><p>Your ❤️ reactions are saved here so you can find those profiles again.</p></div></div>
    <div className="profile-grid">{items.map(p=><ProfileCard key={p.id} p={p} onLike={onLike} interested={interested.has(p.id)||demoInterested.has(p.id)}/>)}{!items.length&&<Empty title="No interested profiles yet" text="Tap Interested ❤️ on a profile in Discover and it will appear here." action={()=>go('/discover')} actionText="Discover people" />}</div>
  </section>;
}

function Matches({ matches }: { matches: Match[] }) {
  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MATCHES</span>
          <h1>Your mutual connections</h1>
          <p>When you both like each other, the connection appears here.</p>
        </div>
      </div>
      {matches.length ? (
        <div className="list-stack">
          {matches.map(m => (
            <button
              className="match-row"
              key={m.id}
              onClick={() => go('/messages/' + m.profile.id)}
            >
              <Avatar p={m.profile} />
              <span>
                <strong>
                  {m.profile.name}, {m.profile.age}
                </strong>
                <small>
                  {m.profile.city}, {m.profile.country}
                </small>
              </span>
              <MessageCircle />
              <ChevronRight />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No matches yet"
          text="Start discovering people and send a few likes."
          action={() => go('/discover')}
          actionText="Discover people"
        />
      )}
    </section>
  );
}

function Messages({ user, profiles }: { user: any; profiles: Profile[] }) {
  if (!user)
    return (
      <Empty
        title="Sign in to see messages"
        text="Your private conversations will appear here."
        action={() => go('/login')}
        actionText="Sign in"
      />
    );
  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MESSAGES</span>
          <h1>Your conversations</h1>          <p>Private conversations with your matches.</p>
        </div>
      </div>      <div className="list-stack">
        {profiles.slice(0, 3).map(p => (
          <button
            className="match-row"
            key={p.id}
            onClick={() => go('/messages/' + p.id)}
          >
            <Avatar p={p} />
            <span>
              <strong>{p.name}</strong>
              <small>
                {p.online ? 'Online now' : 'Tap to open conversation'}
              </small>
            </span>
            <MessageCircle />
            <ChevronRight />
          </button>
        ))}
      </div>
    </section>
  );
}

function ChatPage({
  user,
  profileId,
  profiles,
}: {
  user: any;
  profileId: string;
  profiles: Profile[];
}) {
  const p =
    profiles.find(x => x.id === profileId) ||
    demoProfiles.find(x => x.id === profileId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const connRef = useRef<any>(null);
  useEffect(() => {
    if (!user || !p) return;
    let active = true;
    (async () => {
      try {
        const r = await api.get('/api/messages/' + p.id);
        if (active) setMessages(r.data.messages || []);
      } catch {}
    })();
    const conn = ws.connect();
    connRef.current = conn;
    conn.onMessage((m: any) => {
      if (
        m?.type === 'entity.update' &&
        m.payload?.entity_type === 'conversation' &&
        m.payload?.entity_id === p.id
      ) {
        setMessages(old => [...old, m.payload.data]);
      }
    });
    conn.ready.then(() => {
      if (conn.connectionId)
        api.post('/api/subscriptions', {
          entity_type: 'conversation',
          entity_id: p.id,
          connection_id: conn.connectionId,
        });
    });
    return () => {
      connRef.current?.disconnect();
    };
  }, [user, p?.id]);
  if (!user)
    return (
      <Empty
        title="Sign in to chat"
        text="Create an account to start private conversations."
        action={() => go('/login')}
        actionText="Sign in"
      />
    );
  if (!p)
    return (
      <Empty
        title="Conversation unavailable"
        text="This profile is no longer available."
        action={() => go('/messages')}
        actionText="Back to messages"
      />
    );
  const send = async () => {
    const clean = text.trim();
    if (!clean) return;
    setText('');
    try {
      const r = await api.post('/api/messages', {
        receiverId: p.userId,
        text: clean,
      });
      setMessages(old => [...old, r.data.message]);
    } catch {}
  };
  return (
    <section className="chat-page">
      <button className="back-link" onClick={() => go('/messages')}>
        ← Back to messages
      </button>
      <div className="chat-header">
        <Avatar p={p} />
        <span>
          <strong>
            {p.name}, {p.age}
          </strong>
          <small>
            {p.city} • {p.online ? 'Online' : 'Offline'}
          </small>
        </span>
      </div>
      <div className="chat-body">
        {messages.length ? (
          messages.map(m => (
            <div
              key={m.id}
              className={m.senderId === user.userId ? 'bubble mine' : 'bubble'}
            >
              {m.text}
            </div>
          ))
        ) : (
          <div className="chat-empty">Start the conversation respectfully.</div>
        )}
      </div>
      <div className="chat-compose">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Write a message…"
        />
        <button className="primary" onClick={send}>
          Send
        </button>
      </div>
    </section>
  );
}

async function compressProfileImage(file: File): Promise<{data:string;type:string}> {
  let source: Blob = file;
  const lower = file.name.toLowerCase();
  const heicLike = /\.(heic|heif)$/i.test(lower) || /image\/(heic|heif)/i.test(file.type);
  if (heicLike) {
    const mod:any = await import('heic2any');
    const converted:any = await mod.default({blob:file,toType:'image/jpeg',quality:0.82});
    source = Array.isArray(converted) ? converted[0] : converted;
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    const url = URL.createObjectURL(source);
    try {
      const image = await new Promise<HTMLImageElement>((resolve,reject)=>{
        const img = new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error('Image decode failed.'));
        img.src=url;
      });
      const maxSide=1600;
      const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('Could not prepare the selected photo.');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return {data:canvas.toDataURL('image/jpeg',0.82),type:'image/jpeg'};
    } finally { URL.revokeObjectURL(url); }
  }
  const maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('Could not prepare the selected photo.');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  return {data:canvas.toDataURL('image/jpeg',0.82),type:'image/jpeg'};
}

function MyProfile({user,profile,onSaved}:{user:any,profile:Profile|null,onSaved:()=>void}){
  const [name,setName]=useState(profile?.name||user?.name||''); const [phone,setPhone]=useState(''); const [age,setAge]=useState(String(profile?.age||25)); const [gender,setGender]=useState(profile?.gender||''); const [city,setCity]=useState(profile?.city||''); const [bio,setBio]=useState(profile?.bio||''); const [lookingFor,setLookingFor]=useState(profile?.lookingFor||'Dating / connection'); const [interests,setInterests]=useState(profile?.interests.join(', ')||''); const [photo,setPhoto]=useState(profile?.photo||''); const [photoData,setPhotoData]=useState(''); const [photoFile,setPhotoFile]=useState<File|null>(null); const [savedProfileId,setSavedProfileId]=useState<string|null>(profile?.id||null); const [saved,setSaved]=useState(false); const [photoType,setPhotoType]=useState('image/jpeg'); const [location,setLocation]=useState(profile?.latitude!==undefined&&profile?.longitude!==undefined?{latitude:profile.latitude,longitude:profile.longitude}:null); const [saving,setSaving]=useState(false); const [locating,setLocating]=useState(false);
  useEffect(()=>{(async()=>{try{const r=await api.get('/api/my-contact');setPhone(r.data.phone||'');}catch{}})();},[user?.userId]);
  if(!user)return <Empty title="Create your profile" text="Sign in to create a profile that other members can discover." action={()=>go('/login')} actionText="Sign in"/>;
  const pickPhoto=async(file?:File)=>{
    if(!file)return;
    const isSupportedType=/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type);
    const isSupportedExtension=/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if(!isSupportedType && !isSupportedExtension){
      alert('Please choose a JPEG, PNG, WebP or HEIC/HEIF photo.');
      return;
    }
    if(file.size>25*1024*1024){alert('Please choose an image under 25 MB.');return;}
    try{
      const prepared=await compressProfileImage(file);
      setPhotoFile(null);
      setPhotoType(prepared.type);
      setPhoto(prepared.data);
      setPhotoData(prepared.data);
    }catch(e:any){
      alert('We could not read that photo. Please choose a clear JPEG, PNG, WebP or HEIC/HEIF photo and try again.');
    }
  };
  const fileToDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=reject;reader.readAsDataURL(file);});
  const save=async()=>{if(!name.trim()||Number(age)<18||!city.trim()){alert('Name, age 18+ and city are required.');return;}setSaving(true);setSaved(false);try{const freshPhotoData=photoData || (photoFile?await fileToDataUrl(photoFile):'');const r=await api.post('/api/profile',{name,age:Number(age),gender,city,country:'Nigeria',bio,lookingFor,phone,interests:interests.split(',').map(x=>x.trim()).filter(Boolean),photoData:freshPhotoData,photoContentType:photoType});if(r.data.profile){setSavedProfileId(r.data.profile.id);setPhoto(r.data.profile.photo||photo);setPhotoData('');setPhotoFile(null);setSaved(true);await onSaved();}}catch(e:any){alert('Could not save your profile. ' + String(e?.message || 'Please try again.'));}finally{setSaving(false);}};
  return <section className="form-page"><div className="page-heading"><div><span className="eyebrow">MY PROFILE</span><h1>Put yourself out there</h1><p>Your photo, bio, interests and what you are looking for will appear on your public profile for signed-in members to discover.</p></div></div><div className="form-card"><div className="profile-photo-editor">
  <div className="profile-form-avatar">{photo?<img src={photo} alt="Profile preview"/>:initials(name||'You')}</div>
  <label className="profile-photo-camera" aria-label="Add profile photo" title="Add profile photo">
    <span>📷</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>pickPhoto(e.target.files?.[0])}/>
  </label>
</div><label>Display name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><div className="two-col"><label>Age<input type="number" min="18" value={age} onChange={e=>setAge(e.target.value)}/></label><label>Gender<select value={gender} onChange={e=>setGender(e.target.value)}><option value="">Select</option><option>Woman</option><option>Man</option><option>Non-binary</option></select></label></div><label>City<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Lagos, Abuja, Calabar…"/></label><div className="profile-note"><MapPin/><span><strong>City-based discovery</strong><small>Your city is shown on your profile. Device GPS is not required.</small></span></div><label>Phone number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Your phone number"/><small className="private-note">Only the official NaijaConnect admin can see your phone number.</small></label><label className="bio-field">Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Write a little about yourself…"/></label><label>Interests<input value={interests} onChange={e=>setInterests(e.target.value)} placeholder="Music, travel, food"/></label><label>Looking for<select value={lookingFor} onChange={e=>setLookingFor(e.target.value)}><option>Dating / connection</option><option>Casual connection</option><option>Friendship</option><option>Serious relationship</option></select></label><button className="primary" disabled={saving} onClick={save}>{saving?'Saving profile…':'Save profile'}</button>{saved&&<div className="save-success"><Check size={20}/><div className="save-copy"><strong>Your profile has been saved.</strong><span>Your photo, bio, interests and details are now visible to signed-in members.</span></div>{savedProfileId&&<button className="secondary" onClick={()=>go('/profile/'+savedProfileId)}>Tap to see profile <ChevronRight size={16}/></button>}</div>}</div></section>
}

function SettingsPage({ user, signOut }: { user: any; signOut: () => void }) {
  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>Account & preferences</h1>
          <p>Control how you use NaijaConnect.</p>
        </div>
      </div>
      <div className="settings-list">
        <button onClick={() => go('/profile')}>
          <UserRound />
          <span>
            <strong>Edit profile</strong>
            <small>Update your bio, city and interests.</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => go('/safety')}>
          <ShieldCheck />
          <span>
            <strong>Safety & privacy</strong>
            <small>Learn about blocking, reporting and privacy.</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => go('/discover')}>
          <SlidersHorizontal />
          <span>
            <strong>Discovery preferences</strong>
            <small>Adjust who you want to see.</small>
          </span>
          <ChevronRight />
        </button>
        {user && (
          <button className="danger-row" onClick={signOut}>
            <LogOut />
            <span>
              <strong>Sign out</strong>
              <small>End your current session.</small>            </span>
            <ChevronRight />
          </button>
        )}      </div>
    </section>
  );
}

function SafetyPage() {
  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SAFETY</span>
          <h1>Connect safely</h1>
          <p>
            Real people deserve real boundaries. Keep personal information
            private until you trust someone.
          </p>
        </div>
      </div>
      <div className="safety-grid">
        <div>
          <ShieldCheck />
          <h3>Block</h3>
          <p>Stop another member from contacting you.</p>
        </div>
        <div>
          <Bell />
          <h3>Report</h3>
          <p>Report suspicious, abusive or inappropriate behaviour.</p>
        </div>
        <div>
          <UserRound />
          <h3>Protect your privacy</h3>
          <p>
            Do not share passwords, bank details or sensitive documents in chat.
          </p>
        </div>
        <div>
          <Check />
          <h3>18+ community</h3>
          <p>NaijaConnect is for adults only. Be respectful and consensual.</p>
        </div>
      </div>
      <button className="primary" onClick={() => go('/discover')}>
        Back to discovery
      </button>
    </section>
  );
}

function Avatar({ p }: { p: Profile }) {
  const safe = p || ({name:'Member',photo:undefined} as Profile);
  return (
    <span className="avatar">
      {safe.photo ? (
        <img src={safe.photo} alt="" />
      ) : (
        <span style={{ background: avatarColor(safe.name) }}>
          {initials(safe.name)}
        </span>
      )}
    </span>
  );
}
function AdminPage(){
  const [users,setUsers]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [status,setStatus]=useState('');
  const loadUsers=async()=>{try{const r=await api.get('/api/admin/users');setUsers(r.data.users||[]);}catch{setStatus('Admin access is unavailable.');}};
  const loadThread=async(userId:string)=>{try{const r=await api.get('/api/admin/messages?userId='+encodeURIComponent(userId));setMessages(r.data.messages||[]);}catch{setMessages([]);}};
  useEffect(()=>{loadUsers();},[]);
  const select=async(u:any)=>{setSelected(u);setStatus('');await loadThread(u.id);};
  const send=async()=>{if(!selected||!text.trim())return;try{await api.post('/api/admin/messages',{userId:selected.id,text:text.trim()});setText('');setStatus('Message sent.');await loadThread(selected.id);}catch(e:any){setStatus(e?.message||'Could not send the admin message.');}};
  return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">ADMIN</span><h1>Admin Inbox</h1><p>Only the official NaijaConnect admin can start conversations. Members can reply only to the admin.</p></div><span className="admin-badge"><ShieldCheck size={14}/> ADMIN</span></div>
    <div className="admin-layout">
      <div className="admin-requests">{users.map(u=><button className={selected?.id===u.id?'admin-request active':'admin-request'} key={u.id} onClick={()=>select(u)}><strong>{u.name}, {u.age}</strong><small>{u.city}, {u.country}</small>{u.phone&&<small>Phone: {u.phone}</small>}</button>)}{!users.length&&<div className="empty-mini">No member profiles yet.</div>}</div>
      <div className="admin-chat">{selected?<><div className="admin-chat-head"><ShieldCheck/><span><strong>NaijaConnect Admin</strong><small>Official admin → {selected.name}</small></span></div><div className="admin-thread">{messages.map(m=><div key={m.id} className={m.senderType==='admin'?'admin-bubble mine':'admin-bubble'}><small>{m.senderType==='admin'?'ADMIN':selected.name}</small><p>{m.text}</p><time>{new Date(m.createdAt).toLocaleString()}</time></div>)}{!messages.length&&<div className="empty-mini">No messages yet. Start the conversation.</div>}</div><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message to this member…"/><button className="primary" onClick={send}>Send as Admin</button></>:<div className="empty-mini">Select any member to message them.</div>}{status&&<small className="admin-status">{status}</small>}</div>
    </div>
  </section>;
}

function AdminMessages(){
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const load=async()=>{try{const r=await api.get('/api/admin/messages');setMessages(r.data.messages||[]);}catch{}};
  useEffect(()=>{load();},[]);
  const hasAdminMessage=messages.some(m=>m.senderType==='admin');
  const send=async()=>{if(!text.trim()||busy||!hasAdminMessage)return;setBusy(true);try{await api.post('/api/admin/messages',{text:text.trim()});setText('');await load();}finally{setBusy(false);}};
  if(!hasAdminMessage) return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">ADMIN MESSAGES</span><h1>Official NaijaConnect Admin</h1><p>There are no messages from the official admin yet.</p></div></div><div className="empty-mini">When the admin sends you a message, it will appear here and you will be able to reply.</div></section>;
  return <section className="content-page facebook-admin-chat">
    <div className="page-heading"><div><span className="eyebrow">ADMIN MESSAGES</span><h1>Official NaijaConnect Admin</h1><p>Your private conversation with the official admin.</p></div></div>
    <div className="facebook-admin-thread">
      {messages.map(m=><div className={m.senderType==='user'?'admin-chat-bubble mine':'admin-chat-bubble'} key={m.id}><p>{m.text}</p><time>{new Date(m.createdAt).toLocaleString()}</time></div>)}
    </div>
    <div className="admin-chat-compose">
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/>
      <button className="send-icon-button" disabled={busy||!text.trim()} onClick={send} aria-label="Send message" title="Send message">➤</button>
    </div>
  </section>;
}

function Posts({posts,onCreatePost,onLikePost,onComment}:{posts:Post[],onCreatePost:(text:string,photosData:string[],photoTypes:string[])=>Promise<void>,onLikePost:(id:string)=>Promise<void>,onComment:(id:string,text:string)=>Promise<void>}) {
  const [text,setText]=useState('');
  const [photos,setPhotos]=useState<string[]>([]);
  const [photoTypes,setPhotoTypes]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [showFeeling,setShowFeeling]=useState(false);
  const [commentText,setCommentText]=useState<Record<string,string>>({});
  const pick=(files:FileList|null)=>{
    if(!files)return;
    const selected=Array.from(files).slice(0,8);
    selected.forEach(file=>{
      if(!file.type.startsWith('image/'))return;
      if(file.size>15*1024*1024)return;
      const reader=new FileReader();
      reader.onload=()=>{setPhotos(old=>[...old,String(reader.result||'')]);setPhotoTypes(old=>[...old,file.type]);};
      reader.readAsDataURL(file);
    });
  };
  const publish=async()=>{
    if(!text.trim()&&!photos.length)return;
    setBusy(true);
    try{await onCreatePost(text.trim(),photos.map(x=>x.includes(',')?x.split(',')[1]:x),photoTypes);setText('');setPhotos([]);setPhotoTypes([]);setShowFeeling(false);}
    finally{setBusy(false);}
  };
  return <section className="content-page">
    <div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Community</h1><p>Share updates, photos and moments with signed-in NaijaConnect members.</p></div></div>
    <div className="facebook-composer">
      <div className="composer-head"><Avatar p={{name:'You',photo:undefined} as Profile}/><div><strong>Create a post</strong><small>Share with the NaijaConnect community</small></div></div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What's on your mind?"/>
      {showFeeling&&<div className="feeling-row">{['😊','❤️','😂','🔥','🥰','🎉','😎','🙏'].map(x=><button key={x} onClick={()=>setText(t=>t+x)}>{x}</button>)}</div>}
      {photos.length>0&&<div className={photos.length===1?'post-photo-grid single':'post-photo-grid'}>{photos.map((p,i)=><div className="composer-photo" key={i}><img src={p} alt="Selected post"/><button onClick={()=>{setPhotos(x=>x.filter((_,j)=>j!==i));setPhotoTypes(x=>x.filter((_,j)=>j!==i));}} aria-label="Remove photo"><X size={15}/></button></div>)}</div>}
      <div className="composer-actions"><label className="composer-action"><span>📷</span> Photo / video<input type="file" accept="image/*" multiple onChange={e=>pick(e.target.files)}/></label><button className="composer-action" onClick={()=>setShowFeeling(v=>!v)}><span>😊</span> Feeling / activity</button></div>
      <button className="primary full" disabled={busy||(!text.trim()&&!photos.length)} onClick={publish}>{busy?'Publishing…':'Post'}</button>
    </div>
    <div className="post-feed">{posts.map(p=>{
      const pics=p.photos?.length?p.photos:(p.photo?[p.photo]:[]);
      return <article className="post-card" key={p.id}>
        <div className="post-author"><Avatar p={p.author}/><span><strong>{p.author.name}</strong><small>{p.author.city}, {p.author.country} • {new Date(p.createdAt).toLocaleString()}</small></span></div>
        {p.text&&<p className="post-text">{p.text}</p>}
        {pics.length>0&&<div className={pics.length===1?'post-photo-grid single':'post-photo-grid'}>{pics.map((src,i)=><img className="post-feed-image" key={i} src={src} alt="Community post"/>)}</div>}
        <div className="post-engagement"><span>{p.likes||0} {(p.likes||0)===1?'Like':'Likes'}</span><span>{p.comments?.length||0} {(p.comments?.length||0)===1?'Comment':'Comments'}</span></div>
        <div className="post-actions"><button className={p.likedByMe?'post-action active':'post-action'} onClick={()=>onLikePost(p.id)}><Heart size={18} fill={p.likedByMe?'currentColor':'none'}/> Like</button><button className="post-action" onClick={()=>document.getElementById('comment-'+p.id)?.focus()}><MessageCircle size={18}/> Comment</button><button className="post-action" onClick={()=>go('/profile/'+p.author.id)}>View profile</button></div>
        <div className="comment-list">{(p.comments||[]).map((cm:any)=><div className="comment" key={cm.id}><Avatar p={cm.author}/><div><strong>{cm.author?.name||'Member'}</strong><p>{cm.text}</p></div></div>)}</div>
        <div className="comment-compose"><input id={'comment-'+p.id} value={commentText[p.id]||''} onChange={e=>setCommentText(v=>({...v,[p.id]:e.target.value}))} onKeyDown={async e=>{if(e.key==='Enter'&&(commentText[p.id]||'').trim()){const value=commentText[p.id].trim();setCommentText(v=>({...v,[p.id]:''}));await onComment(p.id,value);}}} placeholder="Write a comment…"/><button onClick={async()=>{const value=(commentText[p.id]||'').trim();if(!value)return;setCommentText(v=>({...v,[p.id]:''}));await onComment(p.id,value);}}>Post</button></div>
      </article>
    })}{!posts.length&&<Empty title="No posts yet" text="Be the first member to share something."/>}</div>
  </section>;
}




export default App;