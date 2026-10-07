import { useEffect, useMemo, useRef, useState } from 'react';
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

function AppContent() {
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

  const signIn = async (email?: string, password?: string) => {
    try {
      await auth.signInWithPassword(String(email || ''), String(password || ''));
      setNotice('You are signed in successfully.');
      return { ok: true, message: '' };
    } catch (e: any) {
      const message = String(e?.message || 'Sign-in could not be completed.');
      setNotice(message);
      return { ok: false, message };
    }
  };
  const signUp = async (email: string, password: string) => {
    try {
      const data = await auth.signUpWithPassword(email, password);

      // Confirm Email is disabled in Supabase, so a successful signup should
      // return a session. We deliberately sign the new account out and send
      // the member to the normal sign-in screen, matching the requested flow.
      if (!data?.session) {
        const message = 'Account creation needs email confirmation. Please make sure Confirm email is OFF in Supabase Auth settings.';
        setNotice(message);
        return { ok: false, message };
      }

      await auth.signOut();
      setUser(null);
      setProfile(null);
      setMatches([]);
      setPosts([]);
      setNotice('Account created successfully. Please sign in to continue.');
      window.location.hash = '#/login';
      setPath('/login');
      return { ok: true, message: '' };
    } catch (e: any) {
      const message = String(e?.message || 'Account creation could not be completed.');
      setNotice(message);
      return { ok: false, message };
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
        {!user && protectedPage && <Login signIn={signIn} signUp={signUp} />}
        {user && path === '/' && <Home user={user} signIn={signIn} />}
        {path === '/' && !user && <Home user={user} signIn={signIn} />}
        {path === '/login' && <Login signIn={signIn} signUp={signUp} />}
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


function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }

export default App;
