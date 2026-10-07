import { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, ws } from '@appdeploy/client';
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

type Post = { id:string; userId:string; text:string; photo?:string; createdAt:number; author:Profile };

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

const ADMIN_EMAIL = 'ADMIN_EMAIL_PENDING';

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

function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles);
  const [matches, setMatches] = useState<Match[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const u = await auth.getUser();
      setUser(u);
      const profileUrl = '/api/profiles';
      if (u) {
        const [me, people, postsResponse] = await Promise.all([
          api.get('/api/me'),
          api.get(profileUrl),
          api.get('/api/posts'),
        ]);
        setProfile(me.data.profile || null);
        setProfiles(
          people.data.profiles?.length ? people.data.profiles : demoProfiles
        );
        setPosts(postsResponse.data.posts || []);
      }
    } catch (e) {
      setNotice(
        'Some live data could not be loaded yet. Demo profiles remain available.'
      );