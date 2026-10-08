import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, supabase, ws } from './lib/backend';
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
  photos?: string[];
  online?: boolean;
  lastActiveAt?: string;
  verified?: boolean;
  adminBadge?: boolean;
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
  return user?.app_metadata?.role === 'admin' || (Array.isArray(user?.app_metadata?.roles) && user.app_metadata.roles.includes('admin')) || String(user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
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
  const normalized = path.startsWith('#') ? path : '#' + path;
  if (window.location.hash !== normalized) window.location.hash = normalized;
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
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = async (showLoading = false) => {
    // Auth events and the periodic fallback can arrive together. Reuse the
    // active refresh instead of issuing duplicate Supabase requests.
    if (refreshInFlight.current) {
      if (showLoading) setLoading(true);
      return refreshInFlight.current;
    }
    const run = (async () => {
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
        // Community/posts routes are currently redirected to Discover, so don't
        // fetch the full posts feed on every background refresh. Posts can still
        // be created through the existing API without adding this recurring load.
      }
      } catch {
        setNotice('Some live data could not be loaded yet. Demo profiles remain available.');
      } finally { if (showLoading) setLoading(false); }
    })();
    refreshInFlight.current = run;
    try {
      await run;
    } finally {
      if (refreshInFlight.current === run) refreshInFlight.current = null;
    }
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
    if (!user) return;
    const timer = window.setInterval(() => { refresh(false); }, 30000);
    return () => window.clearInterval(timer);
  }, [user?.userId]);

  useEffect(() => {
    if (notice) { const t = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(t); }
  }, [notice]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('naijaconnect-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async () => {
        try {
          const r = await api.get('/api/profiles?passive=1');
          setProfiles(r.data.profiles || []);
          const me = await api.get('/api/me');
          setProfile(me.data.profile || null);
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_messages' }, () => {
        window.dispatchEvent(new CustomEvent('naijaconnect-message'));
      })
      .subscribe();
    // Realtime profile updates handle normal changes. Keep a slower fallback
    // refresh for clients where realtime delivery is temporarily unavailable.
    const timer = window.setInterval(async () => {
      try {
        const r = await api.get('/api/profiles?passive=1');
        setProfiles(r.data.profiles || []);
      } catch {}
    }, 60000);
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [user?.userId]);

  useEffect(() => {
    if (!user) return;
    const refreshProfileViews = async () => {
      try {
        const [people, me] = await Promise.all([api.get('/api/profiles?passive=1'), api.get('/api/me')]);
        setProfiles(people.data.profiles || []);
        setProfile(me.data.profile || null);
      } catch {}
    };
    window.addEventListener('naijaconnect-profile-updated', refreshProfileViews);
    return () => window.removeEventListener('naijaconnect-profile-updated', refreshProfileViews);
  }, [user?.userId]);

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
  const deleteMyAccount = async () => {
    if (!window.confirm('Delete your NaijaConnect account permanently? Your profile, interests, messages and account will be removed. This cannot be undone.')) return;
    try {
      await api.post('/api/delete-my-account', {});
      setUser(null); setProfile(null); setMatches([]); setPosts([]); setInterestedIds(new Set()); setDemoInterested(new Set());
      setNotice('Your NaijaConnect account has been permanently deleted.');
      go('/');
    } catch (e:any) {
      setNotice(e?.message || 'Your account could not be deleted. Please try again.');
    }
  };
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
        'Dear NaijaConnect Administration,',
        '',
        'I hope this message finds you well.',
        '',
        'I am writing to request an introduction to ' + p.name + ', whom I am interested in connecting with through NaijaConnect.',
        '',
        'My details:',
        'Name: ' + memberName,
        'Email: ' + (user?.email || ''),
        '',
        'I would appreciate your assistance in facilitating this introduction through the NaijaConnect platform.',
        '',
        'Thank you for your time and assistance. I look forward to hearing from you.',
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

    {path.startsWith('/profile/') && <ProfilePage id={path.split('/')[2]} profiles={profiles} user={user} ownProfile={profile} onLike={like} onConnect={connectToAdmin} />}
    {path === '/admin' && isAdminUser(user) && <AdminPage />}
    {path === '/admin-messages' && user && <AdminMessages />}
    {user && path === '/profile' && <MyProfile user={user} profile={profile} onSaved={refresh} />}
    {user && path === '/settings' && <SettingsPage user={user} signOut={signOut} onDeleteAccount={deleteMyAccount} />}
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
  const [notificationOpen,setNotificationOpen]=useState(false);
  const [unreadCount,setUnreadCount]=useState(0);
  const [notifications,setNotifications]=useState<any[]>([]);
  const admin=isAdminUser(user);

  const loadUnread=async()=>{
    if(!user){setUnreadCount(0);setNotifications([]);return;}
    try{
      const r=await api.get('/api/admin/messages/unread-count');
      setUnreadCount(Number(r.data.count||0));
    }catch{setUnreadCount(0);}
  };
  const loadNotifications=async()=>{
    if(!user)return;
    try{
      if(admin){
        const r=await api.get('/api/admin/message-threads');
        const items=(r.data.threads||[]).filter((t:any)=>Number(t.unreadCount||0)>0).slice(0,8);
        setNotifications(items);
      }else{
        const r=await api.get('/api/admin/messages');
        const items=(r.data.messages||[]).filter((m:any)=>m.senderType==='admin').slice(-8).reverse();
        setNotifications(items);
      }
      await loadUnread();
    }catch{}
  };

  useEffect(()=>{
    let alive=true;
    const run=async()=>{if(!alive)return;await loadUnread();};
    run();
    const onLiveMessage=()=>{loadUnread();if(notificationOpen)loadNotifications();};
    window.addEventListener('naijaconnect-message',onLiveMessage);
    const timer=window.setInterval(loadUnread,30000);
    return ()=>{alive=false;window.clearInterval(timer);window.removeEventListener('naijaconnect-message',onLiveMessage);};
  },[user?.userId,admin,notificationOpen]);

  useEffect(()=>{
    const title=unreadCount>0?'('+(unreadCount>99?'99+':unreadCount)+') NaijaConnect':'NaijaConnect';
    document.title=title;
    return ()=>{document.title='NaijaConnect';};
  },[unreadCount]);

  const toggleNotifications=async()=>{
    const next=!notificationOpen;
    setNotificationOpen(next);
    if(next) await loadNotifications();
  };

  return <header className="topbar">
    <button className="brand" onClick={()=>go('/')}><span className="brand-dot">N</span><span><strong>NaijaConnect</strong><small>Meet. Match. Connect.</small></span></button>
    <nav className="desktop-links"><button onClick={()=>go('/discover')}>Discover</button><button onClick={()=>go('/profile')}>My Profile</button></nav>
    <div className="top-actions">{user?<><button className="avatar-mini" onClick={()=>go('/profile')}>{profile?.photo?<img src={profile.photo} alt=""/>:initials(profile?.name||user.name||'You')}</button><button className={notificationOpen?'notification-btn active':'notification-btn'} onClick={toggleNotifications} aria-label="Open notifications" title="Notifications"><Bell size={19}/>{unreadCount>0&&<span className="notification-count">{unreadCount>99?'99+':unreadCount}</span>}</button>{admin&&<span className="admin-badge"><ShieldCheck size={14}/> <span>ADMIN</span></span>}<button className="menu-btn" onClick={()=>setOpen(v=>!v)} aria-label="Open menu"><Menu size={21}/></button></>:<button className="sign-btn" onClick={()=>go('/login')}><LogIn size={17}/> Sign in</button>}</div>
    {notificationOpen&&<div className="notification-panel" role="dialog" aria-label="Notifications">
      <div className="notification-panel-head"><strong>Notifications</strong>{unreadCount>0&&<span>{unreadCount} new</span>}</div>
      {admin ? (notifications.length ? notifications.map((n:any)=><button className="notification-item" key={n.userId} onClick={()=>{setNotificationOpen(false);go('/admin')}}><Avatar p={n.profile||{name:n.profile?.name||'Member'}}/><span><strong>{n.profile?.name||'Member'}</strong><small>{n.unreadCount} new message{Number(n.unreadCount)===1?'':'s'}{n.latest?.text?' · '+n.latest.text:''}</small></span><ChevronRight size={16}/></button>) : <div className="notification-empty">No new member messages.</div>)
      : (notifications.length ? notifications.map((n:any)=><button className="notification-item" key={n.id} onClick={()=>{setNotificationOpen(false);go('/admin-messages')}}><Avatar p={{name:'NaijaConnect Admin'}}/><span><strong>NaijaConnect Admin</strong><small>{n.text}</small></span><ChevronRight size={16}/></button>) : <div className="notification-empty">No new notifications.</div>)}
      <button className="notification-open-all" onClick={()=>{setNotificationOpen(false);go(admin?'/admin':'/admin-messages')}}>Open messages</button>
    </div>}
    {open&&user&&<div className="account-menu">
      <button onClick={()=>{setOpen(false);go('/profile')}}><UserRound size={17}/> My Profile</button>
      <button onClick={()=>{setOpen(false);go('/interested')}}><Heart size={17}/> Interested</button>
      {unreadCount>0&&<button className="menu-notification" onClick={()=>{setOpen(false);go(admin?'/admin':'/admin-messages')}}><MessageCircle size={17}/> Messages <span>{unreadCount>99?'99+':unreadCount}</span></button>}
      {admin&&<button onClick={()=>{setOpen(false);go('/admin')}}><ShieldCheck size={17}/> Admin Inbox {unreadCount>0&&<span className="menu-count">{unreadCount>99?'99+':unreadCount}</span>}</button>}
      {!admin&&<button onClick={()=>{setOpen(false);go('/admin-messages')}}><MessageCircle size={17}/> Admin Messages {unreadCount>0&&<span className="menu-count">{unreadCount>99?'99+':unreadCount}</span>}</button>}
      <button onClick={()=>{setOpen(false);go('/settings')}}><Settings size={17}/> Settings</button>
      <button onClick={()=>{setOpen(false);go('/safety')}}><ShieldCheck size={17}/> Safety</button>
      <button onClick={()=>{setOpen(false);signOut()}}><LogOut size={17}/> Sign out</button>
    </div>}
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
      <button type="button" className="secondary full" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');}}>{mode==='signin'?<><span className="auth-signup-line">New to NaijaConnect?</span><span className="auth-signup-line auth-signup-link">Create an account</span></>:'Already have an account? Sign in'}</button>
      <div className="auth-security"><ShieldCheck size={16}/><span>Your password is securely handled by Supabase Auth.</span></div>
      <small className="legal">By continuing, you confirm that you are 18 or older and agree to use the platform respectfully.</small>
    </div></section>
  );
}

function Discover({profiles,onLike,interested}:{profiles:Profile[],onLike:(id:string)=>void,interested?:Set<string>}){
  const [city,setCity]=useState('All Nigeria');
  const [gender,setGender]=useState('Everyone');
  const [lookingFor,setLookingFor]=useState('Everyone');
  const [maxAge,setMaxAge]=useState(45);
  const [query,setQuery]=useState('');
  const [onlineOnly,setOnlineOnly]=useState(false);
  const [verifiedOnly,setVerifiedOnly]=useState(false);
  const cities=['All Nigeria','Lagos','Abuja','Port Harcourt','Calabar','Enugu','Ibadan','Benin City','Kano','Kaduna','Owerri','Uyo','Worldwide'];
  const filtered=useMemo(()=>profiles.filter(p=>{
    if(!p)return false;
    const text=(p.name+' '+p.city+' '+p.interests.join(' ')+' '+p.bio).toLowerCase();
    return (city==='All Nigeria' ? p.country==='Nigeria' : city==='Worldwide' ? true : p.city.toLowerCase()===city.toLowerCase())
      && (gender==='Everyone'||p.gender===gender)
      && (lookingFor==='Everyone'||p.lookingFor===lookingFor)
      && p.age<=maxAge
      && (!query||text.includes(query.toLowerCase()))
      && (!onlineOnly||p.online)
      && (!verifiedOnly||p.verified);
  }),[profiles,city,gender,lookingFor,maxAge,query,onlineOnly,verifiedOnly]);
  const cityCounts=cities.filter(c=>c!=='Worldwide').map(c=>({city:c,count:profiles.filter(p=>c==='All Nigeria'?p.country==='Nigeria':p.city.toLowerCase()===c.toLowerCase()).length}));
  return <section className="content-page">
    <div className="page-heading"><div><span className="eyebrow">DISCOVER</span><h1>Find people near you</h1><p>Search members by city, age, interests and what they are looking for.</p></div><button className="outline-btn" onClick={()=>go('/settings')}><SlidersHorizontal size={17}/> Preferences</button></div>
    <div className="directory-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, city or interest"/></div>
    <div className="city-chips" role="list" aria-label="Cities">{cityCounts.map(x=><button key={x.city} className={city===x.city?'city-chip active':'city-chip'} onClick={()=>setCity(x.city)} aria-label={x.city+' '+x.count+' profiles'}><span>{x.city}</span><small>{x.count}</small></button>)}</div>
    <div className="filter-panel dating-filter-panel">
      <select value={city} onChange={e=>setCity(e.target.value)}>{cities.map(x=><option key={x}>{x}</option>)}</select>
      <select value={gender} onChange={e=>setGender(e.target.value)}><option>Everyone</option><option>Woman</option><option>Man</option><option>Non-binary</option></select>
      <select value={lookingFor} onChange={e=>setLookingFor(e.target.value)}><option>Everyone</option><option>Dating / connection</option><option>Casual connection</option><option>Friendship</option><option>Serious relationship</option></select>
      <select value={maxAge} onChange={e=>setMaxAge(Number(e.target.value))}><option value="25">18–25</option><option value="35">18–35</option><option value="45">18–45</option><option value="60">18–60</option></select>
    </div>
    <div className="quick-filters"><button className={onlineOnly?'quick-filter active':'quick-filter'} onClick={()=>setOnlineOnly(v=>!v)}>🟢 Online now</button><button className={verifiedOnly?'quick-filter active':'quick-filter'} onClick={()=>setVerifiedOnly(v=>!v)}>✓ Verified</button><span>{filtered.length} profile{filtered.length===1?'':'s'} found</span></div>
    <div className="profile-grid">{filtered.map(p=><ProfileCard key={p.id} p={p} onLike={onLike} interested={interested?.has(p.id) || false}/>)}{!filtered.length&&<Empty title="No people found" text="Try another city, age range or filter." action={()=>{setCity('All Nigeria');setGender('Everyone');setLookingFor('Everyone');setMaxAge(60);setOnlineOnly(false);setVerifiedOnly(false);setQuery('')}} actionText="Clear filters"/>}</div>
  </section>
}

function ProfileCard({p,onLike,interested}:{p:Profile,onLike:(id:string)=>void,interested?:boolean}){
  return <article className="profile-card">
    <button className="profile-photo" onClick={()=>go('/profile/'+p.id)}>{p.photo?<img src={p.photo} alt={p.name}/>:<span style={{background:avatarColor(p.name)}}>{initials(p.name)}</span>}<i className={p.online?'online':''}></i>{p.adminBadge?<AdminBadge/>:p.verified&&<VerifiedBadge/>}</button>
    <div className="profile-card-body"><button className="profile-name" onClick={()=>go('/profile/'+p.id)}>{p.name}, {p.age} {p.adminBadge?<AdminBadge/>:p.verified&&<VerifiedBadge/>}</button><span className="location"><MapPin size={14}/>{p.distanceKm!==undefined?p.distanceKm.toFixed(1)+' km away':p.city+', '+p.country}</span><div className="activity-line">{p.online?<span className="online-text">● Online now</span>:<span>Recently active</span>}</div><p>{p.bio||'New to NaijaConnect — say hello.'}</p><div className="tags">{p.interests.slice(0,3).map(x=><span key={x}>{x}</span>)}</div><div className="card-actions"><button className={interested?'like-btn active':'like-btn'} onClick={()=>onLike(p.id)}><Heart size={17} fill={interested?'currentColor':'none'}/> Interested</button><button className="more-btn" onClick={()=>go('/profile/'+p.id)}>View profile <ChevronRight size={16}/></button></div></div>
  </article>
}

function ProfilePage({id,profiles,user,ownProfile,onLike,onConnect}:{id:string,profiles:Profile[],user:any,ownProfile?:Profile|null,onLike:(id:string)=>void,onConnect:(p:Profile)=>void}){
  // A profile can be addressed by either its database profile id or the
  // authenticated user's id. "View my profile" uses the latter, so support
  // both identifiers instead of incorrectly reporting the profile as missing.
  const p=(ownProfile && (ownProfile.id===id || ownProfile.userId===id) ? ownProfile : null) || profiles.find(x=>x.id===id || x.userId===id) || demoProfiles.find(x=>x.id===id || x.userId===id);
  const own=!!user&&p?.userId===user.userId;
  const [menu,setMenu]=useState(false);
  const [slide,setSlide]=useState(0);
  const photos=(p?.photos&&p.photos.length?p.photos:(p?.photo?[p.photo]:[]));
  const interests=Array.isArray(p?.interests)?p.interests:[];
  if(!p)return <Empty title="Profile not found" text="We couldn't load this profile yet. Please try again." action={()=>window.dispatchEvent(new Event('naijaconnect-profile-updated'))} actionText="Try again"/>;
  const share=async()=>{try{if(navigator.share) await navigator.share({title:'NaijaConnect profile',text:'Check out '+p.name+' on NaijaConnect.',url:window.location.href});else await navigator.clipboard.writeText(window.location.href);setMenu(false);}catch{}};
  const report=async()=>{const reason=window.prompt('Why are you reporting this profile?','Suspicious or fake profile');if(!reason)return;try{await api.post('/api/reports',{profileId:p.id,reason});setMenu(false);alert('Report submitted. Thank you for helping keep NaijaConnect safe.');}catch(e:any){alert(e?.message||'Could not submit the report.');}};
  const block=async()=>{if(!window.confirm('Block '+p.name+'? You will no longer see this profile in Discover.'))return;try{const r=await api.post('/api/blocks',{profileId:p.id});setMenu(false);if(r.data.blocked){alert('Profile blocked.');go('/discover');}}catch(e:any){alert(e?.message||'Could not block this profile.');}};
  return <section className="detail-page"><button className="back-link" onClick={()=>go('/discover')}>← Back to discover</button><div className="profile-detail">
    <div>
      <div className="detail-photo">{photos.length? <img src={photos[slide%photos.length]} alt={p.name}/>:<span style={{background:avatarColor(p.name)}}>{initials(p.name)}</span>}<i className={p.online?'online':''}></i></div>
      {photos.length>1&&<div className="photo-thumbs">{photos.map((src,i)=><button key={src+i} className={i===slide?'photo-thumb active':'photo-thumb'} onClick={()=>setSlide(i)}><img src={src} alt="" /></button>)}</div>}
    </div>
    <div className="detail-copy">
      <div className="detail-topline"><div><div className="eyebrow">{p.online?'ONLINE NOW':'PROFILE'}</div><h1>{p.name}</h1><div className="detail-age">{p.age} years old {p.adminBadge?<AdminBadge label/>:p.verified&&<VerifiedBadge label/>}</div></div><div className="profile-more-wrap"><button className="icon-square" onClick={()=>setMenu(v=>!v)} aria-label="More profile options"><MoreHorizontal/></button>{menu&&<div className="profile-more-menu"><button onClick={share}>Share profile</button>{!own&&<><button onClick={report}>Report profile</button><button onClick={block}>Block profile</button></>}</div>}</div></div>
      <div className="detail-location"><MapPin size={18}/>{p.city}, {p.country}</div>
      <div className="profile-status-card"><span className={p.online?'status-dot online':'status-dot'}></span><div><strong>{p.online?'Online now':'Recently active'}</strong><small>Available to connect through NaijaConnect</small></div></div>
      <p className="big-bio">{p.bio||'This member has not added a bio yet.'}</p>
      <div className="detail-section"><h3>About</h3><p>{p.city}, {p.country}</p></div>
      {interests.length>0&&<div className="detail-section"><h3>Interests</h3><div className="tags large">{interests.map(x=><span key={x}>{x}</span>)}</div></div>}
      <div className="detail-section"><h3>Looking for</h3><p>{p.lookingFor||'Connection'}</p></div>
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
    try {
      const mod:any = await import('heic2any');
      const converted:any = await mod.default({ blob: file, toType: 'image/jpeg', quality: 0.86 });
      source = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      // Some phones report HEIC/HEIF inconsistently. The browser fallback below
      // will still get a chance to decode the selected file.
      source = file;
    }
  }

  const maxSide = 1800;

  // First try the browser's native bitmap decoder.
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { data: canvas.toDataURL('image/jpeg', 0.86), type: 'image/jpeg' };
  } catch {}

  // Fallback for Android/browser combinations where createImageBitmap rejects
  // an otherwise valid photo.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(source);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decoder could not open this photo.'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/jpeg', 0.86), type: 'image/jpeg' };
}

function VerifiedBadge({label=false}:{label?:boolean}) {
  return <span className={label ? 'verified-badge verified-badge-label' : 'verified-badge'} aria-label="Verified member" title="Verified by NaijaConnect admin"><Check size={12} strokeWidth={3}/>{label&&<span>Verified</span>}</span>;
}
function AdminBadge({label=false}:{label?:boolean}) {
  return <span className={label ? 'admin-profile-badge admin-profile-badge-label' : 'admin-profile-badge'} aria-label="NaijaConnect admin badge" title="NaijaConnect admin badge"><ShieldCheck size={12} strokeWidth={3}/>{label&&<span>NaijaConnect badge</span>}</span>;
}

function MyProfile({user,profile,onSaved}:{user:any,profile:Profile|null,onSaved:()=>void}){
  const [name,setName]=useState(profile?.name||user?.name||''); const [phone,setPhone]=useState(''); const [age,setAge]=useState(String(profile?.age||25)); const [gender,setGender]=useState(profile?.gender||''); const [city,setCity]=useState(profile?.city||''); const [bio,setBio]=useState(profile?.bio||''); const [lookingFor,setLookingFor]=useState(profile?.lookingFor||'Dating / connection'); const [interests,setInterests]=useState(profile?.interests.join(', ')||''); const [photo,setPhoto]=useState(profile?.photo||''); const [photos,setPhotos]=useState<string[]>(profile?.photos?.length?profile.photos:(profile?.photo?[profile.photo]:[])); const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false);
  useEffect(()=>{(async()=>{try{const r=await api.get('/api/my-contact');setPhone(r.data.phone||'');}catch{}})();},[user?.userId]);
  if(!user)return <Empty title="Create your profile" text="Sign in to create a profile that other members can discover." action={()=>go('/login')} actionText="Sign in"/>;
  const pickPhotos=async(files:FileList|null)=>{
    if(!files?.length)return;
    const selected=Array.from(files).slice(0, Math.max(0, 6-photos.length));
    if(!selected.length){setSaved(false);return;}
    const prepared:string[]=[];
    const failures:string[]=[];
    for(const file of selected){
      const lower=file.name.toLowerCase();
      const looksLikeImage=file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(lower);
      if(!looksLikeImage){failures.push(file.name);continue;}
      if(file.size>25*1024*1024){failures.push(file.name);continue;}
      try{
        const result=await compressProfileImage(file);
        prepared.push(result.data);
      }catch{
        failures.push(file.name);
      }
    }
    if(prepared.length){
      setPhotos(old=>[...old,...prepared].slice(0,6));
      setPhoto(prepared[prepared.length-1]);
      setSaved(false);
    }
    if(failures.length && !prepared.length){
      alert('That photo format could not be opened on this device. Please choose another photo from your gallery.');
    }
  };
  const removePhoto=(index:number)=>{setPhotos(old=>{const next=old.filter((_,i)=>i!==index);setPhoto(next[0]||'');return next;});setSaved(false);};
  const save=async()=>{
    if(!name.trim()||Number(age)<18||!city.trim()){alert('Name, age 18+ and city are required.');return;}
    setSaving(true);setSaved(false);
    try{
      const existingPhotos=photos.filter(x=>/^https?:/.test(x)); const newPhotos=photos.filter(x=>x.startsWith('data:')); const r=await api.post('/api/profile',{name,age:Number(age),gender,city,country:'Nigeria',bio,lookingFor,phone,interests:interests.split(',').map(x=>x.trim()).filter(Boolean),existingPhotos,photosData:newPhotos,photoContentTypes:newPhotos.map(()=> 'image/jpeg')});
      if(r.data.profile){setPhotos(r.data.profile.photos?.length?r.data.profile.photos:(r.data.profile.photo?[r.data.profile.photo]:[]));setPhoto(r.data.profile.photo||'');setSaved(true);await onSaved();}
    }catch(e:any){alert('Could not save your profile. '+String(e?.message||'Please try again.'));}finally{setSaving(false);}
  };
  return <section className="form-page"><div className="page-heading"><div><span className="eyebrow">MY PROFILE</span><h1>Put yourself out there</h1><p>Build a complete profile so people can discover you by city, interests and dating intentions.</p></div></div><div className="form-card">
    <div className="profile-photo-editor"><div className="profile-form-avatar">{photo?<img src={photo} alt="Profile preview"/>:initials(name||'You')}</div><label className="profile-photo-camera" aria-label="Add profile photos" title="Add photos"><span>📷</span><input type="file" accept="image/*,.heic,.heif" multiple onChange={e=>{pickPhotos(e.target.files);e.currentTarget.value='';}}/></label></div>
    <div className="photo-manager">{photos.map((src,i)=><div className="managed-photo" key={src+i}><img src={src} alt={'Profile photo '+(i+1)}/><button type="button" onClick={()=>removePhoto(i)} aria-label="Remove photo">×</button></div>)}</div>
    <small className="photo-limit">Tap the camera to add up to 6 photos at once. Your first photo is your main profile picture.</small>
    <label>Display name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><div className="two-col"><label>Age<input type="number" min="18" value={age} onChange={e=>setAge(e.target.value)}/></label><label>Gender<select value={gender} onChange={e=>setGender(e.target.value)}><option value="">Select</option><option>Woman</option><option>Man</option><option>Non-binary</option></select></label></div>
    <label>City<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Lagos, Abuja, Calabar…"/></label><div className="profile-note"><MapPin/><span><strong>City-based discovery</strong><small>Your city appears on your profile and in city search.</small></span></div>
    <label>Phone number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Your phone number"/><small className="private-note">Only the official NaijaConnect admin can see your phone number.</small></label>
    <label className="bio-field">Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Write a little about yourself…"/></label>
    <label>Interests<input value={interests} onChange={e=>setInterests(e.target.value)} placeholder="Music, travel, food"/></label>
    <label>Looking for<select value={lookingFor} onChange={e=>setLookingFor(e.target.value)}><option>Dating / connection</option><option>Casual connection</option><option>Friendship</option><option>Serious relationship</option></select></label>
    <button className="primary" disabled={saving} onClick={save}>{saving?'Saving profile…':'Save profile'}</button>{saved&&<div className="save-success"><Check size={20}/><div className="save-copy"><strong>Your profile has been saved.</strong><span>Your profile is now ready for discovery.</span></div><button className="secondary" onClick={()=>go('/profile/'+user.userId)}>View my profile <ChevronRight size={16}/></button></div>}
  </div></section>;
}
function SettingsPage({ user, signOut, onDeleteAccount }: { user: any; signOut: () => void; onDeleteAccount: () => Promise<void> }) {
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
        )}
        {user && (
          <button className="danger-row account-delete-row" onClick={onDeleteAccount}>
            <X />
            <span>
              <strong>Delete my account</strong>
              <small>Permanently remove your NaijaConnect account and profile.</small>
            </span>
            <ChevronRight />
          </button>
        )}
      </div>
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
function AdminMessageBubble({m,messages,mine,displayName,onReply,onReact}:{m:any;messages:any[];mine:boolean;displayName:string;onReply:(m:any)=>void;onReact:(m:any,reaction:string)=>void}) {
  const [showReactions,setShowReactions]=useState(false);
  const [startX,setStartX]=useState<number|null>(null);
  const quoted=m.replyToId ? messages.find((x:any)=>x.id===m.replyToId) : null;
  const counts=(m.reactions||[]).reduce((acc:any,x:any)=>{acc[x.reaction]=(acc[x.reaction]||0)+1;return acc;},{});
  return <div className={mine?'admin-chat-message mine':'admin-chat-message'} onTouchStart={e=>setStartX(e.changedTouches[0]?.clientX||0)} onTouchEnd={e=>{const end=e.changedTouches[0]?.clientX||0;if(startX!==null&&Math.abs(end-startX)>55)onReply(m);setStartX(null);}}>
    {quoted&&<div className="message-quote"><small>Replying to {quoted.senderType==='admin'?'Admin':displayName}</small><span>{quoted.text}</span></div>}
    <div className="admin-chat-bubble"><small>{mine?'ADMIN':displayName}</small><p>{m.text}</p><time>{new Date(m.createdAt).toLocaleString()}</time></div>
    <div className="message-tools">
      <button onClick={()=>onReply(m)} aria-label="Reply to message">↩ Reply</button>
      <button onClick={()=>setShowReactions(v=>!v)} aria-label="React to message">☺ React</button>
    </div>
    {showReactions&&<div className="reaction-picker">{['👍','❤️','😂','😮','😢','🙏'].map(r=><button key={r} onClick={()=>{onReact(m,r);setShowReactions(false)}}>{r}</button>)}</div>}
    {Object.keys(counts).length>0&&<div className="message-reactions">{Object.entries(counts).map(([r,c])=><span key={r}>{r} {String(c)}</span>)}</div>}
  </div>;
}

function MessageBubble({m,otherName,onReply,onReact,replyText}:{m:any;otherName:string;onReply:(m:any)=>void;onReact:(m:any,reaction:string)=>void;replyText?:string}) {
  const [showReactions,setShowReactions]=useState(false);
  const touchStart=useRef<number|null>(null);
  const reactions=['👍','❤️','😂','😮','😢','🙏'];
  const counts=(m.reactions||[]).reduce((acc:any,r:any)=>{acc[r.reaction]=(acc[r.reaction]||0)+1;return acc;},{});
  const sender=m.senderType==='admin'?'ADMIN':otherName;
  return <div className={m.senderType==='admin'?'admin-bubble mine':'admin-bubble'} onTouchStart={e=>{touchStart.current=e.touches[0]?.clientX??null;}} onTouchEnd={e=>{if(touchStart.current!==null && touchStart.current-e.changedTouches[0].clientX>55) onReply(m);touchStart.current=null;}}>
    {m.replyToId&&replyText&&<div className="message-reply-preview"><small>Replying to</small><span>{replyText}</span></div>}
    <small>{sender}</small>
    <p>{m.text}</p>
    <div className="message-meta"><time>{new Date(m.createdAt).toLocaleString()}</time><button className="message-reply-btn" onClick={()=>onReply(m)} aria-label="Reply to message">↩ Reply</button><button className="message-react-btn" onClick={()=>setShowReactions(v=>!v)} aria-label="React to message">☺</button></div>
    {Object.keys(counts).length>0&&<div className="message-reactions">{Object.entries(counts).map(([r,c])=><button key={r} onClick={()=>onReact(m,r)}>{r} <span>{String(c)}</span></button>)}</div>}
    {showReactions&&<div className="reaction-picker">{reactions.map(r=><button key={r} onClick={()=>{onReact(m,r);setShowReactions(false);}}>{r}</button>)}</div>}
  </div>;
}

function AdminPage(){
  const [users,setUsers]=useState<any[]>([]);
  const [threads,setThreads]=useState<any[]>([]);
  const [reports,setReports]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [replyTo,setReplyTo]=useState<any>(null);
  const [status,setStatus]=useState('');
  const [tab,setTab]=useState<'members'|'reports'>('members');
  const [search,setSearch]=useState('');
  const [showChatMobile,setShowChatMobile]=useState(false);

  const loadUsers=async()=>{try{const r=await api.get('/api/admin/users');setUsers(r.data.users||[]);setStatus('');}catch(e:any){setStatus(e?.message||'Admin member directory could not be loaded.');}};
  const loadThreads=async()=>{try{const r=await api.get('/api/admin/message-threads');setThreads(r.data.threads||[]);}catch{}};
  const loadReports=async()=>{try{const r=await api.get('/api/admin/reports');setReports(r.data.reports||[]);}catch(e:any){setStatus(e?.message||'Reports could not be loaded.');}};
  const loadThread=async(userId:string,markRead=true)=>{
    try{
      const r=await api.get('/api/admin/messages?userId='+encodeURIComponent(userId));
      setMessages(r.data.messages||[]);
      if(markRead) { await api.post('/api/admin/messages/read',{userId}); }
      await loadThreads();
    }catch{setMessages([]);}
  };
  useEffect(()=>{Promise.all([loadUsers(),loadThreads(),loadReports()]);},[]);
  useEffect(()=>{const timer=window.setInterval(()=>{loadThreads(); if(selected) loadThread(selected.id,false);},15000);return()=>window.clearInterval(timer);},[selected?.id]);
  const select=async(u:any)=>{setSelected(u);setReplyTo(null);setStatus('');setShowChatMobile(true);await loadThread(u.id,true);};
  const visibleUsers=users.filter(u=>{const q=search.trim().toLowerCase();return !q || String(u.name||'').toLowerCase().includes(q) || String(u.city||'').toLowerCase().includes(q) || String(u.phone||'').toLowerCase().includes(q);});
  const selectThread=async(t:any)=>{
    const u=users.find(x=>x.id===t.userId)||t.profile;
    if(u) await select(u);
  };
  const send=async()=>{
    const clean=text.trim();
    if(!selected||!clean)return;
    try{
      await api.post('/api/admin/messages',{userId:selected.id,text:clean,replyToId:replyTo?.id||null});
      setText('');setReplyTo(null);setStatus('Message sent.');await loadThread(selected.id,true);
    }catch(e:any){setStatus(e?.message||'Could not send the admin message.');}
  };
  const react=async(m:any,reaction:string)=>{try{await api.post('/api/admin/message-reaction',{messageId:m.id,reaction});await loadThread(selected.id,false);}catch(e:any){setStatus(e?.message||'Could not save that reaction.');}};
  const deleteUser=async(u:any)=>{if(!window.confirm('Delete '+(u.name||'this member')+' permanently? This cannot be undone.'))return;try{await api.post('/api/admin/delete-user',{userId:u.id});setUsers(old=>old.filter(x=>x.id!==u.id));setThreads(old=>old.filter(x=>x.userId!==u.id));if(selected?.id===u.id){setSelected(null);setMessages([]);setShowChatMobile(false);}setStatus('Member account deleted.');}catch(e:any){setStatus(e?.message||'Could not delete this member.');}};
  const toggleVerified=async(u:any)=>{try{const r=await api.post('/api/admin/verify-user',{userId:u.id,verified:!u.verified});setUsers(old=>old.map(x=>x.id===u.id?{...x,verified:r.data.profile.verified}:x));setSelected((x:any)=>x?.id===u.id?{...x,verified:r.data.profile.verified}:x);setStatus(r.data.profile.verified?'Profile verified.':'Verification removed.');}catch(e:any){setStatus(e?.message||'Could not update verification.');}};
  const toggleAdminBadge=async(u:any)=>{try{const r=await api.post('/api/admin/badge',{userId:u.id,adminBadge:!u.adminBadge});setUsers(old=>old.map(x=>x.id===u.id?{...x,adminBadge:r.data.profile.adminBadge}:x));setSelected((x:any)=>x?.id===u.id?{...x,adminBadge:r.data.profile.adminBadge}:x);window.dispatchEvent(new CustomEvent('naijaconnect-profile-updated',{detail:{userId:u.id}}));setStatus(r.data.profile.adminBadge?'Orange admin badge assigned.':'Orange admin badge removed.');}catch(e:any){setStatus(e?.message||'Could not update the admin badge.');}};
  return <section className="content-page">
    <div className="page-heading"><div><span className="eyebrow">ADMIN</span><h1>NaijaConnect Admin</h1><p>Manage members, messages, safety reports and moderation.</p></div><span className="admin-badge"><ShieldCheck size={14}/> ADMIN</span></div>
    <div className="admin-tabs">
      <button className={tab==='members'?'admin-tab active':'admin-tab'} onClick={()=>setTab('members')}>Members <span>{users.length}</span></button>
      <button className={tab==='reports'?'admin-tab active':'admin-tab'} onClick={()=>setTab('reports')}>Reports <span>{reports.filter(x=>x.status==='open').length}</span></button>
    </div>
    {tab==='members' && <div className="admin-layout">
      <div className={showChatMobile?'admin-requests admin-list-collapsed-mobile':'admin-requests'}>
        <div className="admin-member-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search any member by name or city"/></div>
        {visibleUsers.map(u=>{
          const thread=threads.find(t=>t.userId===u.id);
          const unread=Number(thread?.unreadCount||0);
          return <div className="admin-member-row" key={u.id}>
            <button className={selected?.id===u.id?'admin-request active':'admin-request'} onClick={()=>select(u)}>
              <span className="admin-request-name">{u.name}, {u.age}</span>
              <small>{u.city}, {u.country}</small>
              {thread?.latest?.text&&<small className="admin-latest-message">{thread.latest.senderType==='user'?'↩ ':'↗ '}{thread.latest.text}</small>}
              {u.phone&&<small>Phone: {u.phone}</small>}
              {unread>0&&<span className="admin-unread-count">{unread>99?'99+':unread} new</span>}
            </button>
            <div className="admin-member-actions"><button className={u.verified?'admin-verify-member active':'admin-verify-member'} onClick={()=>toggleVerified(u)}>{u.verified?'✓ Verified':'Verify'}</button><button className={u.adminBadge?'admin-badge-member active':'admin-badge-member'} onClick={()=>toggleAdminBadge(u)}>{u.adminBadge?'● Orange':'Orange'}</button><button className="admin-delete-member" onClick={()=>deleteUser(u)}>Delete</button></div>
          </div>;
        })}
        {!visibleUsers.length&&<div className="empty-mini">{status||(users.length?'No members match your search.':'No member profiles yet.')}</div>}
      </div>
      <div className={showChatMobile?'admin-chat admin-chat-mobile-open':'admin-chat'}>
        {selected ? <>
          <button className="admin-mobile-back" onClick={()=>setShowChatMobile(false)}>← All conversations</button>
          <div className="admin-chat-head"><Avatar p={selected}/><span><strong>{selected.name}</strong><small>Private admin conversation</small></span>{Number(threads.find(t=>t.userId===selected.id)?.unreadCount||0)>0&&<span className="admin-chat-unread">New</span>}</div>
          <div className="admin-thread">
            {messages.map(m=><MessageBubble key={m.id} m={m} otherName={selected.name} replyText={m.replyToId?messages.find(x=>x.id===m.replyToId)?.text:''} onReply={setReplyTo} onReact={react}/>)}
            {!messages.length&&<div className="empty-mini">No messages yet. Start the conversation.</div>}
          </div>
          {replyTo&&<div className="reply-composer-preview"><div><small>Replying to {replyTo.senderType==='admin'?'ADMIN':selected.name}</small><span>{replyTo.text}</span></div><button onClick={()=>setReplyTo(null)} aria-label="Cancel reply">×</button></div>}
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message to this member…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/>
          <button className="primary" onClick={send} disabled={!text.trim()}>Send as Admin</button>
        </> : <div className="empty-mini">Select any member to message them.</div>}
        {status&&<small className="admin-status">{status}</small>}
      </div>
    </div>}
    {tab==='reports' && <div className="admin-report-list">{reports.map(report=><article className="admin-report-card" key={report.id}><div><strong>{report.reported?.name||'Member'}</strong><small>Reported by {report.reporter?.name||'Member'} • {new Date(report.createdAt).toLocaleString()}</small></div><span className="report-reason">{report.reason}</span>{report.details&&<p>{report.details}</p>}<small>Status: {report.status}</small></article>)}{!reports.length&&<div className="empty-mini">No safety reports yet.</div>}</div>}
  </section>;
}
function AdminMessages(){
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const [replyTo,setReplyTo]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const load=async(markRead=false)=>{
    try{
      const r=await api.get('/api/admin/messages');
      setMessages(r.data.messages||[]);
      if(markRead) await api.post('/api/admin/messages/read',{});
    }catch{}
  };
  useEffect(()=>{load(true);const timer=window.setInterval(()=>load(false),15000);return()=>window.clearInterval(timer);},[]);
  const hasAdminMessage=messages.some(m=>m.senderType==='admin');
  const react=async(m:any,reaction:string)=>{try{await api.post('/api/admin/message-reaction',{messageId:m.id,reaction});await load(false);}catch{}};
  const send=async()=>{if(!text.trim()||busy||!hasAdminMessage)return;setBusy(true);try{await api.post('/api/admin/messages',{text:text.trim(),replyToId:replyTo?.id||null});setText('');setReplyTo(null);await load(true);}finally{setBusy(false);}};
  if(!hasAdminMessage) return <section className="content-page"><div className="page-heading"><div><span className="eyebrow">ADMIN MESSAGES</span><h1>Official NaijaConnect Admin</h1><p>There are no messages from the official admin yet.</p></div></div><div className="empty-mini">When the admin sends you a message, it will appear here and you will be able to reply.</div></section>;
  return <section className="content-page facebook-admin-chat">
    <div className="page-heading"><div><span className="eyebrow">ADMIN MESSAGES</span><h1>Official NaijaConnect Admin</h1><p>Your private conversation with the official NaijaConnect admin. Members can only reply to the admin here.</p></div></div>
    <div className="facebook-admin-thread">
      {messages.map(m=><MessageBubble key={m.id} m={m} otherName="You" replyText={m.replyToId?messages.find(x=>x.id===m.replyToId)?.text:''} onReply={setReplyTo} onReact={react}/>)}
    </div>
    {replyTo&&<div className="reply-composer-preview"><div><small>Replying to {replyTo.senderType==='admin'?'NaijaConnect Admin':'You'}</small><span>{replyTo.text}</span></div><button onClick={()=>setReplyTo(null)} aria-label="Cancel reply">×</button></div>}
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