import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DirectionsRenderer, GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  Leaf,
  LockKeyhole,
  LogOut,
  Map,
  MapPin,
  Moon,
  Navigation,
  PackagePlus,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Truck,
  Trash2,
  Upload,
  UserCog,
  UserCircle,
  Utensils,
  Users,
  X
} from 'lucide-react';
import { API_URL, api, clearSession, setSession, storedUser } from './api.js';
import { getSocket } from './socket.js';

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const googleLibraries = ['places'];
const defaultCenter = { lat: 28.6139, lng: 77.209 };
const mapOptions = { disableDefaultUI: true, styles: [] };
const themeStoreKey = 'annseva_theme';
const driverEmitIntervalMs = 2500;
const routeRefreshMs = 12000;
const markerAnimationMs = 1200;

const roleMeta = {
  DONOR: {
    label: 'Donor',
    tone: 'green',
    accent: '#00ED64',
    icon: Utensils,
    nav: [
      ['overview', BarChart3, 'Overview'],
      ['create', PackagePlus, 'Create'],
      ['listings', Utensils, 'Listings'],
      ['ongoing', Route, 'Ongoing'],
      ['completed', CheckCircle2, 'Completed']
    ]
  },
  COLLECTOR: {
    label: 'Collector',
    tone: 'blue',
    accent: '#42A5FF',
    icon: Users,
    nav: [
      ['overview', Map, 'Map'],
      ['available', Users, 'Available'],
      ['ongoing', Route, 'Deliveries'],
      ['completed', CheckCircle2, 'Completed']
    ]
  },
  DRIVER: {
    label: 'Driver',
    tone: 'orange',
    accent: '#FF9F43',
    icon: Truck,
    nav: [
      ['overview', BarChart3, 'Overview'],
      ['jobs', Truck, 'Jobs'],
      ['ongoing', Route, 'Active'],
      ['completed', CheckCircle2, 'Completed']
    ]
  }
};

const stages = ['listed', 'connected', 'picking', 'delivering', 'completed'];
const otpStoreKey = 'annseva_otps';
const fallbackFoodImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80';
const stageLabels = {
  listed: 'Listed',
  connected: 'Connected',
  picking: 'Picking',
  delivering: 'Delivering',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

function savedAddress(user) {
  return user?.profile?.address || {};
}

function listingFood(listing) {
  return listing?.foodDetails || {};
}

function listingLocations(listing) {
  return listing?.locations || {};
}

function hasSavedAddress(user) {
  const address = savedAddress(user);
  return Boolean(address.fullAddress && address.houseFlat && address.area && address.lat != null && address.lng != null);
}

function readableAddress(address = {}) {
  return [address.houseFlat, address.area, address.landmark, address.fullAddress].filter(Boolean).join(', ');
}

function mediaUrl(path) {
  if (!path) return fallbackFoodImage;
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

function normalizePoint(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    ...point,
    lat,
    lng,
    heading: point.heading == null || Number.isNaN(Number(point.heading)) ? null : Number(point.heading)
  };
}

function driverPointFromEvent(event) {
  return normalizePoint(event?.location || event);
}

function activeRouteTarget(listing) {
  if (listing?.stage === 'picking') return normalizePoint(listing.locations?.donor);
  if (listing?.stage === 'delivering') return normalizePoint(listing.locations?.collector);
  return null;
}

function mapIconUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function listingMarkerIcon(google, { active = false, hover = false, stage = 'listed' } = {}) {
  if (!google?.maps) return undefined;
  const size = hover || active ? 48 : 40;
  const palette = {
    listed: { fill: '#16A34A', ring: '#DCFCE7', glyph: '#166534' },
    connected: { fill: '#2563EB', ring: '#DBEAFE', glyph: '#1D4ED8' },
    picking: { fill: '#F59E0B', ring: '#FEF3C7', glyph: '#B45309' },
    delivering: { fill: '#7C3AED', ring: '#EDE9FE', glyph: '#6D28D9' }
  };
  const tone = palette[stage] || palette.listed;
  const svg = `
    <svg width="48" height="56" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <filter id="shadow" x="0" y="0" width="48" height="56" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.28"/>
      </filter>
      ${stage !== 'listed' ? `<circle cx="24" cy="21" r="18" fill="${tone.fill}" fill-opacity="0.18"/>` : ''}
      <g filter="url(#shadow)">
        <path d="M24 3C14.06 3 6 10.75 6 20.31C6 34.24 24 53 24 53C24 53 42 34.24 42 20.31C42 10.75 33.94 3 24 3Z" fill="${tone.fill}"/>
        <path d="M24 5.75C15.65 5.75 8.88 12.27 8.88 20.31C8.88 31.02 20.89 45.59 24 49.18C27.11 45.59 39.12 31.02 39.12 20.31C39.12 12.27 32.35 5.75 24 5.75Z" stroke="white" stroke-opacity="0.9" stroke-width="2"/>
        <circle cx="24" cy="21" r="12.5" fill="${tone.ring}"/>
        <path d="M16 23.5H31.2C33.1 23.5 34.6 22 34.6 20.1C34.6 18.24 33.1 16.7 31.2 16.7H27.7L25.3 13.6H20.1L17.8 16.7H16V23.5Z" fill="${tone.glyph}"/>
        <circle cx="19.1" cy="26.8" r="2.4" fill="#F8FAFC" stroke="${tone.glyph}" stroke-width="1.8"/>
        <circle cx="30.7" cy="26.8" r="2.4" fill="#F8FAFC" stroke="${tone.glyph}" stroke-width="1.8"/>
        <path d="M32.2 16.9L35.2 14.2" stroke="${tone.glyph}" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`;

  return {
    url: mapIconUrl(svg),
    scaledSize: new google.maps.Size(size, Math.round(size * 1.17)),
    anchor: new google.maps.Point(size / 2, Math.round(size * 1.17)),
    labelOrigin: new google.maps.Point(size / 2, size / 2)
  };
}

function driverVehicleIcon(google, heading = 0) {
  if (!google?.maps) return undefined;
  const rotation = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const svg = `
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <filter id="shadow" x="4" y="5" width="44" height="42" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#020617" flood-opacity="0.30"/>
      </filter>
      <circle cx="26" cy="26" r="21" fill="#16A34A" fill-opacity="0.12"/>
      <g filter="url(#shadow)" transform="rotate(${rotation} 26 26)">
        <rect x="13.5" y="21" width="19" height="8.5" rx="4.25" fill="#16A34A"/>
        <rect x="28.2" y="16.3" width="9.2" height="8.8" rx="2.2" fill="#F59E0B"/>
        <path d="M15.8 21.3L20 16.8H25.6L29.6 21.3" stroke="#E6F4EA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M35.2 20.3L39 18.2" stroke="#E6F4EA" stroke-width="2.1" stroke-linecap="round"/>
        <circle cx="18.7" cy="32" r="4.1" fill="#0F172A" stroke="#F8FAFC" stroke-width="2"/>
        <circle cx="34.2" cy="32" r="4.1" fill="#0F172A" stroke="#F8FAFC" stroke-width="2"/>
        <circle cx="18.7" cy="32" r="1.4" fill="#16A34A"/>
        <circle cx="34.2" cy="32" r="1.4" fill="#16A34A"/>
        <path d="M20.2 24.8H28.8" stroke="#E6F4EA" stroke-width="1.8" stroke-linecap="round"/>
      </g>
    </svg>`;

  return {
    url: mapIconUrl(svg),
    scaledSize: new google.maps.Size(44, 44),
    anchor: new google.maps.Point(22, 22)
  };
}

function storedTheme() {
  return localStorage.getItem(themeStoreKey) === 'light' ? 'light' : 'dark';
}

function userInitials(user = {}) {
  return (user.name || user.email || 'AS')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function UserAvatar({ user, src, className = '', alt }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src || (user?.profileImageUrl ? mediaUrl(user.profileImageUrl) : '');
  const initials = userInitials(user);

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  return (
    <span className={`user-avatar ${className} ${imageSrc && !failed ? 'has-image' : 'initials-avatar'}`}>
      {imageSrc && !failed ? (
        <img src={imageSrc} alt={alt || user?.name || 'Profile'} onError={() => setFailed(true)} />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('AnnSeva UI crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app role-green">
          <div className="crash-fallback glass">
            <h1>Something went wrong</h1>
            <p>The screen was protected from going blank. Refresh once, or go back to the dashboard.</p>
            <button className="primary" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState(storedUser());
  const [view, setView] = useState('overview');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(storedTheme);

  useEffect(() => {
    if (!user) return;
    setView(roleMeta[user.role].nav[0][0]);
  }, [user?.role]);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    api('/api/auth/me')
      .then((data) => {
        if (mounted && data.user) updateUser(data.user);
      })
      .catch((err) => console.error('Failed to refresh profile:', err));
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem(themeStoreKey, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3600);
  }

  function updateUser(nextUser) {
    const token = localStorage.getItem('annseva_token');
    if (token) setSession({ token, user: nextUser });
    setUser(nextUser);
  }

  if (!user) {
    return <PublicExperience onAuth={setUser} notify={notify} theme={theme} setTheme={setTheme} />;
  }

  const meta = roleMeta[user.role];

  return (
    <div className={`app role-${meta.tone} theme-${theme}`} style={{ '--role-accent': meta.accent }}>
      <Topbar user={user} setView={setView} theme={theme} setTheme={setTheme} onLogout={() => { clearSession(); setUser(null); }} />
      <div className="shell">
        <aside className="sidebar glass">
          <div className="role-pill">{meta.label} workspace</div>
          <nav>
            {meta.nav.map(([id, Icon, label]) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="content">
          <Dashboard user={user} setUser={updateUser} view={view} setView={setView} notify={notify} />
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PublicExperience({ onAuth, notify, theme, setTheme }) {
  const [selectedRole, setSelectedRole] = useState('DONOR');
  const meta = roleMeta[selectedRole];

  return (
    <div className={`public-page role-${meta.tone} theme-${theme}`} style={{ '--role-accent': meta.accent }}>
      <header className="landing-nav">
        <a className="logo" href="#hero"><Leaf size={22} /> AnnSeva</a>
        <div className="landing-actions">
          <nav>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#roles">Roles</a>
            <a href="#auth">Login</a>
          </nav>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </header>
      <LandingPage />
      <AuthSection
        selectedRole={selectedRole}
        setSelectedRole={setSelectedRole}
        onAuth={onAuth}
        notify={notify}
      />
    </div>
  );
}

function LandingPage() {
  return (
    <>
      <section id="hero" className="landing-hero reveal">
        <div>
          <span className="eyebrow"><Sparkles size={16} /> Real-time redistribution network</span>
          <h1>Move surplus food from excess to impact.</h1>
          <p>AnnSeva connects donors, NGOs, and drivers with live tracking, secure OTP handoffs, and a calm operational dashboard built for speed.</p>
          <div className="hero-actions">
            <a className="primary link-button" href="#auth">Start now <ArrowRight size={18} /></a>
            <a className="ghost-link" href="#how">See flow</a>
          </div>
        </div>
        <div className="hero-visual glass">
          <div className="route-line" />
          <div className="route-node donor-node"><Utensils size={22} /> Donor</div>
          <div className="route-node collector-node"><Users size={22} /> NGO</div>
          <div className="route-node driver-node"><Truck size={22} /> Driver</div>
          <div className="live-chip"><Navigation size={16} /> Live route active</div>
        </div>
      </section>

      <section id="how" className="landing-section reveal">
        <SectionHeading label="How it works" title="Three roles, one verified movement." />
        <div className="step-grid">
          {[
            ['Donor lists food', 'Surplus food is listed from the saved profile location.', Utensils],
            ['Collector accepts', 'The NGO locks the listing and receives secure OTPs.', Users],
            ['Driver delivers', 'Pickup and delivery are verified before completion.', Truck]
          ].map(([title, copy, Icon], index) => (
            <div className="step-card glass" key={title}>
              <span>{index + 1}</span>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="landing-section reveal">
        <SectionHeading label="Features" title="Built for trustworthy field operations." />
        <div className="feature-grid">
          <Feature icon={Route} title="Real-time tracking" copy="Donors and collectors can follow active deliveries as driver locations update." />
          <Feature icon={LockKeyhole} title="OTP security" copy="Pickup and delivery transitions are blocked until the backend verifies the correct OTP." />
          <Feature icon={Leaf} title="Zero waste" copy="Every completed listing contributes to visible food-saved and impact metrics." />
        </div>
      </section>

      <section className="impact-band reveal">
        <Stat label="Meals saved potential" value="12K+" />
        <Stat label="Verified deliveries" value="3.8K" />
        <Stat label="Partner kitchens" value="240" />
        <Stat label="Cities ready" value="18" />
      </section>

      <section id="roles" className="landing-section reveal">
        <SectionHeading label="Roles" title="Purpose-built dashboards for every operator." />
        <div className="role-explain-grid">
          {Object.entries(roleMeta).map(([role, meta]) => {
            const Icon = meta.icon;
            return (
              <div className={`role-explain role-${meta.tone} glass`} style={{ '--role-accent': meta.accent }} key={role}>
                <Icon size={28} />
                <h3>{meta.label}</h3>
                <p>{role === 'DONOR' ? 'Create listings from your saved pickup location and track impact.' : role === 'COLLECTOR' ? 'Find nearby food on a live map, accept, and monitor deliveries.' : 'Accept connected jobs, share live location, and complete OTP handoffs.'}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-section trust-section reveal">
        <SectionHeading label="Trust" title="Designed for accountable redistribution." />
        <div className="testimonial-grid">
          <blockquote className="glass">“The live map and OTP handoff make coordination much clearer for our volunteers.”<span>NGO operations lead</span></blockquote>
          <blockquote className="glass">“A donor can list food in under a minute once the profile location is saved.”<span>Community kitchen manager</span></blockquote>
        </div>
      </section>

      <footer className="footer">
        <div className="logo"><Leaf size={20} /> AnnSeva</div>
        <span>contact@annseva.local</span>
        <a href="#hero">Back to top</a>
      </footer>
    </>
  );
}

function SectionHeading({ label, title }) {
  return <div className="section-heading"><span>{label}</span><h2>{title}</h2></div>;
}

function Feature({ icon: Icon, title, copy }) {
  return <div className="feature-card glass"><Icon size={24} /><h3>{title}</h3><p>{copy}</p></div>;
}

function AuthSection({ selectedRole, setSelectedRole, onAuth, notify }) {
  const [mode, setMode] = useState('register');
  const [form, setForm] = useState({ name: '', email: '', password: '', organization: '' });
  const [busy, setBusy] = useState(false);
  const meta = roleMeta[selectedRole];

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { ...form, role: selectedRole };
      const session = await api(`/api/auth/${mode}`, { method: 'POST', body });
      setSession(session);
      onAuth(session.user);
      notify(`Welcome ${session.user.name}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="auth" className="auth-section">
      <div className="auth-copy">
        <SectionHeading label="Access" title="Choose your role and enter the network." />
        <p>The selected role sets your dashboard color, workflows, and navigation instantly.</p>
      </div>
      <form className="auth-card glass" onSubmit={submit}>
        <div className="switcher">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
        </div>
        {mode === 'register' && (
          <>
            <RoleCards selectedRole={selectedRole} onSelect={setSelectedRole} />
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            {selectedRole === 'COLLECTOR' && <label>Organization<input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></label>}
          </>
        )}
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" minLength={mode === 'register' ? 6 : 1} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <button className="primary" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Enter dashboard' : `Continue as ${meta.label}`}</button>
      </form>
    </section>
  );
}

function RoleCards({ selectedRole, onSelect }) {
  return (
    <div className="role-card-grid">
      {Object.entries(roleMeta).map(([role, meta]) => {
        const Icon = meta.icon;
        return (
          <button
            type="button"
            key={role}
            className={`role-select-card role-${meta.tone} ${selectedRole === role ? 'selected' : ''}`}
            style={{ '--role-accent': meta.accent }}
            onClick={() => onSelect(role)}
          >
            <Icon size={24} />
            <strong>{meta.label}</strong>
            <small>{role === 'DONOR' ? 'List surplus food' : role === 'COLLECTOR' ? 'Accept nearby food' : 'Move active jobs'}</small>
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle({ theme, setTheme }) {
  const isLight = theme === 'light';
  const Icon = isLight ? Sun : Moon;
  const next = isLight ? 'dark' : 'light';

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon size={18} />
      <span>{isLight ? 'Light' : 'Dark'}</span>
    </button>
  );
}

function Topbar({ user, setView, theme, setTheme, onLogout }) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [notificationsClosing, setNotificationsClosing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const profileButtonRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const notificationDropdownRef = useRef(null);
  const profileCloseTimerRef = useRef(null);
  const notificationCloseTimerRef = useRef(null);

  function closeProfileDropdown({ animated = true } = {}) {
    window.clearTimeout(profileCloseTimerRef.current);
    if (!open || !animated) {
      setOpen(false);
      setProfileClosing(false);
      return;
    }
    setProfileClosing(true);
    profileCloseTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setProfileClosing(false);
    }, 170);
  }

  function closeNotificationDropdown({ animated = true } = {}) {
    window.clearTimeout(notificationCloseTimerRef.current);
    if (!notificationsOpen || !animated) {
      setNotificationsOpen(false);
      setNotificationsClosing(false);
      return;
    }
    setNotificationsClosing(true);
    notificationCloseTimerRef.current = window.setTimeout(() => {
      setNotificationsOpen(false);
      setNotificationsClosing(false);
    }, 170);
  }

  function toggleNotifications() {
    window.clearTimeout(notificationCloseTimerRef.current);
    if (notificationsOpen) {
      closeNotificationDropdown();
      return;
    }
    closeProfileDropdown({ animated: false });
    setNotificationsClosing(false);
    setNotificationsOpen(true);
  }

  function toggleProfile() {
    window.clearTimeout(profileCloseTimerRef.current);
    if (open) {
      closeProfileDropdown();
      return;
    }
    closeNotificationDropdown({ animated: false });
    setProfileClosing(false);
    setOpen(true);
  }

  async function loadNotifications() {
    try {
      const data = await api('/api/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  async function markRead(notification) {
    try {
      await api(`/api/notifications/${notification._id}/read`, { method: 'PATCH' });
      setNotifications((items) => items.map((item) => item._id === notification._id ? { ...item, read: true } : item));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }

  useEffect(() => {
    loadNotifications();
    const socket = getSocket();
    socket.on('notification:new', (notification) => {
      setNotifications((items) => [notification, ...items].slice(0, 30));
    });
    return () => socket.off('notification:new');
  }, []);

  useEffect(() => {
    function handleDocumentPointerDown(event) {
      const target = event.target;
      const insideNotifications =
        notificationDropdownRef.current?.contains(target) ||
        notificationButtonRef.current?.contains(target);
      const insideProfile =
        profileDropdownRef.current?.contains(target) ||
        profileButtonRef.current?.contains(target);

      if (notificationsOpen && !insideNotifications) closeNotificationDropdown();
      if (open && !insideProfile) closeProfileDropdown();
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      window.clearTimeout(profileCloseTimerRef.current);
      window.clearTimeout(notificationCloseTimerRef.current);
    };
  }, [open, notificationsOpen]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <header className="topbar">
      <div className="logo"><Leaf size={22} /> AnnSeva</div>
      <div className="profile-menu-wrap">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button ref={notificationButtonRef} className="bell-button" onClick={toggleNotifications} aria-label="Open notifications">
          <Bell size={20} />
          {unreadCount > 0 && <span>{unreadCount}</span>}
        </button>
        {notificationsOpen && (
          <div ref={notificationDropdownRef} className={`notification-dropdown glass ${notificationsClosing ? 'closing' : ''}`}>
            <div className="profile-dropdown-head">
              <strong>Notifications</strong>
              <span>{unreadCount} unread</span>
            </div>
            {notifications.length ? notifications.map((notification) => (
              <button
                key={notification._id}
                className={notification.read ? '' : 'unread'}
                onClick={() => markRead(notification)}
              >
                <span>{notification.message}</span>
                <small>{new Date(notification.createdAt).toLocaleString()}</small>
              </button>
            )) : <div className="notification-empty">No notifications yet</div>}
          </div>
        )}
        <button ref={profileButtonRef} className="avatar-button" onClick={toggleProfile} aria-label="Open profile menu">
          <UserAvatar user={user} className="nav-avatar" />
        </button>
        {open && (
          <div ref={profileDropdownRef} className={`profile-dropdown glass ${profileClosing ? 'closing' : ''}`}>
            <div className="profile-dropdown-head">
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            <button onClick={() => { setView('profile-view'); closeProfileDropdown(); }}><UserCircle size={17} /> View Profile</button>
            <button onClick={() => { setView('profile-edit'); closeProfileDropdown(); }}><UserCog size={17} /> Edit Profile</button>
            <button onClick={onLogout}><LogOut size={17} /> Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}

function Dashboard({ user, setUser, view, setView, notify }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [otpVault, setOtpVault] = useState(() => JSON.parse(localStorage.getItem(otpStoreKey) || '{}'));

  async function load() {
    setLoading(true);
    try {
      const data = await api('/api/listings');
      setListings(data.listings);
      syncVisibleOtps(data.listings);
    } catch (err) {
      notify(err.message);
    } finally {
      setLoading(false);
    }
  }

  function saveOtps(listingId, otps) {
    const next = { ...otpVault, [listingId]: { ...(otpVault[listingId] || {}), ...otps } };
    setOtpVault(next);
    localStorage.setItem(otpStoreKey, JSON.stringify(next));
  }

  function syncVisibleOtps(items) {
    const discovered = {};
    items.forEach((listing) => {
      if (listing.donorOtp || listing.collectorOtp) {
        discovered[listing._id] = {
          ...(otpVault[listing._id] || {}),
          ...(listing.donorOtp ? { donorOtp: listing.donorOtp } : {}),
          ...(listing.collectorOtp ? { collectorOtp: listing.collectorOtp } : {})
        };
      }
    });
    if (!Object.keys(discovered).length) return;
    const next = { ...otpVault, ...discovered };
    setOtpVault(next);
    localStorage.setItem(otpStoreKey, JSON.stringify(next));
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('listings:changed', load);
      socket.on('listing:update', (updated) => {
        setListings((items) => items.map((item) => (item._id === updated._id ? updated : item)));
        if (updated.donorOtp || updated.collectorOtp) {
          saveOtps(updated._id, {
            ...(updated.donorOtp ? { donorOtp: updated.donorOtp } : {}),
            ...(updated.collectorOtp ? { collectorOtp: updated.collectorOtp } : {})
          });
        }
      });
    return () => {
      socket.off('listings:changed', load);
      socket.off('listing:update');
    };
  }, []);

  const buckets = useMemo(() => ({
    live: listings.filter((l) => ['listed', 'connected'].includes(l.stage)),
    mapActive: listings.filter((l) => !['completed', 'cancelled'].includes(l.stage)),
    ongoing: listings.filter((l) => ['picking', 'delivering'].includes(l.stage)),
    completed: listings.filter((l) => ['completed', 'cancelled'].includes(l.stage))
  }), [listings]);

  if (loading) return <SkeletonGrid />;

  return (
    <>
      {view === 'overview' && <HeroStats user={user} listings={listings} />}
      {view === 'profile-view' && <ProfileView user={user} listings={listings} setView={setView} />}
      {view === 'profile-edit' && <ProfileEdit user={user} setUser={setUser} notify={notify} />}
      {view === 'overview' && user.role === 'COLLECTOR' && (
        <CollectorMapView user={user} listings={buckets.mapActive} notify={notify} reload={load} saveOtps={saveOtps} />
      )}
      {view === 'overview' && user.role !== 'COLLECTOR' && <Overview user={user} listings={listings} notify={notify} reload={load} otpVault={otpVault} saveOtps={saveOtps} />}
      {view === 'create' && <CreateListing user={user} notify={notify} reload={load} setView={setView} />}
      {['listings', 'available', 'jobs'].includes(view) && (
        <>
          <PageTitle title={pageHeading(user.role, view)} subtitle={pageSubtitle(user.role, view)} />
          {user.role === 'COLLECTOR' && <CollectorMapView user={user} listings={buckets.mapActive} notify={notify} reload={load} saveOtps={saveOtps} compact />}
          <ListingGrid user={user} listings={buckets.live} notify={notify} reload={load} otpVault={otpVault} saveOtps={saveOtps} />
        </>
      )}
      {view === 'ongoing' && (
        <>
          <PageTitle title={pageHeading(user.role, view)} subtitle={pageSubtitle(user.role, view)} />
          <ListingGrid user={user} listings={buckets.ongoing} notify={notify} reload={load} otpVault={otpVault} saveOtps={saveOtps} />
        </>
      )}
      {view === 'completed' && (
        <>
          <PageTitle title={pageHeading(user.role, view)} subtitle={pageSubtitle(user.role, view)} />
          <ListingGrid user={user} listings={buckets.completed} notify={notify} reload={load} otpVault={otpVault} saveOtps={saveOtps} />
        </>
      )}
    </>
  );
}

function pageHeading(role, view) {
  const headings = {
    DONOR: {
      listings: 'Your Listings',
      ongoing: 'Ongoing Deliveries',
      completed: 'Completed'
    },
    COLLECTOR: {
      available: 'Available Listings',
      ongoing: 'Ongoing Collections',
      completed: 'Completed'
    },
    DRIVER: {
      jobs: 'Available Jobs',
      ongoing: 'Ongoing Deliveries',
      completed: 'Completed'
    }
  };

  return headings[role]?.[view] || 'Listings';
}

function pageSubtitle(role, view) {
  const subtitles = {
    listings: 'Manage food you have listed for pickup.',
    available: 'Review nearby donor listings and accept the right match.',
    jobs: 'Pick up connected jobs and move them through verified delivery.',
    ongoing: role === 'COLLECTOR' ? 'Track accepted food collections in progress.' : 'Track active routes and handoffs in progress.',
    completed: 'Review completed and closed activity.'
  };

  return subtitles[view] || '';
}

function PageTitle({ title, subtitle }) {
  return (
    <div className="page-title reveal">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function HeroStats({ user, listings }) {
  const meals = listings.reduce((sum, item) => sum + Number(item.foodDetails.quantity || 0), 0);
  const active = listings.filter((item) => ['picking', 'delivering'].includes(item.stage)).length;
  const completed = listings.filter((item) => item.stage === 'completed').length;

  return (
    <section className="hero-strip">
      <div>
        <p>Manage and track surplus food in real-time</p>
        <h1>Food Movement Command Center</h1>
      </div>
      <Stat label="Food saved" value={meals} />
      <Stat label="Active routes" value={active} />
      <Stat label="Completed" value={completed} />
      <Stat label="Impact score" value={user.impactScore || 0} />
    </section>
  );
}

function Stat({ label, value }) {
  return <div className="stat glass"><strong>{value}</strong><span>{label}</span></div>;
}

function Overview({ user, listings, notify, reload, otpVault, saveOtps }) {
  const focus =
    user.role === 'DONOR'
      ? listings.filter((l) => !['completed', 'cancelled'].includes(l.stage)).slice(0, 3)
      : listings.filter((l) => ['connected', 'picking', 'delivering'].includes(l.stage)).slice(0, 3);

  return (
    <section>
      <div className="section-title">
        <h2>Priority work</h2>
        <span>{focus.length} items need attention</span>
      </div>
      <ListingGrid user={user} listings={focus} notify={notify} reload={reload} otpVault={otpVault} saveOtps={saveOtps} />
    </section>
  );
}

function avatarUrl(user) {
  return user?.profileImageUrl ? mediaUrl(user.profileImageUrl) : '';
}

function ProfileView({ user, listings, setView }) {
  const address = savedAddress(user);
  const totalListings = listings.filter((listing) => listing.donorId?._id === user.id || listing.donorId === user.id).length;
  const completedDeliveries = listings.filter((listing) => listing.stage === 'completed').length;

  return (
    <section className="profile-view-shell reveal">
      <div className="profile-hero-card glass">
        <UserAvatar user={user} className="profile-avatar-large" />
        <div>
          <span className="role-pill inline">{roleMeta[user.role].label}</span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
        <button className="primary" onClick={() => setView('profile-edit')}>Edit Profile</button>
      </div>
      <div className="profile-info-grid">
        <div className="profile-info-card glass">
          <h3>Saved Address</h3>
          <p>{readableAddress(address) || 'No address saved yet'}</p>
          <div className="profile-detail-row"><span>Area</span><strong>{address.area || 'Not set'}</strong></div>
          <div className="profile-detail-row"><span>Landmark</span><strong>{address.landmark || 'Not set'}</strong></div>
        </div>
        <div className="profile-info-card glass">
          <h3>Impact</h3>
          <div className="profile-stat-row"><strong>{totalListings}</strong><span>Total listings</span></div>
          <div className="profile-stat-row"><strong>{completedDeliveries}</strong><span>Completed deliveries</span></div>
          <div className="profile-stat-row"><strong>{user.impactScore || 0}</strong><span>Impact score</span></div>
        </div>
      </div>
    </section>
  );
}

function ProfileEdit({ user, setUser, notify }) {
  const currentAddress = savedAddress(user);
  const [form, setForm] = useState({
    name: user.name || '',
    organization: user.organization || '',
    profileImageUrl: user.profileImageUrl || '',
    profileImageData: '',
    profile: {
      address: {
        fullAddress: currentAddress.fullAddress || '',
        houseFlat: currentAddress.houseFlat || '',
        area: currentAddress.area || '',
        landmark: currentAddress.landmark || '',
        label: currentAddress.label || 'Home',
        lat: currentAddress.lat ?? null,
        lng: currentAddress.lng ?? null
      }
    }
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function selectProfileImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Profile image must be 5MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, profileImageData: reader.result }));
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    const address = form.profile.address;
    if (!address.fullAddress || address.lat == null || address.lng == null || !address.houseFlat || !address.area) {
      notify('Complete your address details before saving');
      return;
    }

    setBusy(true);
    try {
      const data = await api('/api/profile', { method: 'PUT', body: form });
      setUser(data.user);
      notify('Profile saved');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-panel glass profile-edit-panel" onSubmit={submit}>
      <div className="section-title">
        <div>
          <h2>Edit Profile</h2>
          <span>Update your identity, profile photo, and saved address.</span>
        </div>
      </div>
      <div className="profile-photo-editor">
        <UserAvatar user={{ ...user, profileImageUrl: form.profileImageUrl }} src={form.profileImageData || avatarUrl({ profileImageUrl: form.profileImageUrl })} className="profile-avatar-large" alt="Profile preview" />
        <div>
          <strong>Profile picture</strong>
          <span>Upload from device and preview before saving.</span>
          <label className="upload-button"><Upload size={16} /> Upload image<input type="file" accept="image/*" onChange={(e) => selectProfileImage(e.target.files?.[0])} /></label>
        </div>
      </div>
      <div className="form-grid inner">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        {user.role === 'COLLECTOR' && <label>Organization<input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></label>}
      </div>
      <div className="address-card">
        <div>
          <span className="address-label">{form.profile.address.label}</span>
          <h3>{readableAddress(form.profile.address) || 'No address added yet'}</h3>
          <p>{form.profile.address.fullAddress || 'Add an address to unlock listings and map-based acceptance.'}</p>
        </div>
        <button type="button" className="primary" onClick={() => setPickerOpen(true)}>Edit Address</button>
      </div>
      {pickerOpen && (
        <AddressPickerModal
          value={form.profile.address}
          onClose={() => setPickerOpen(false)}
          onSave={(address) => {
            setForm({ ...form, profile: { address } });
            setPickerOpen(false);
          }}
          notify={notify}
        />
      )}
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
    </form>
  );
}

function CreateListing({ user, notify, reload, setView }) {
  const hasProfile = hasSavedAddress(user);
  const [form, setForm] = useState({ title: '', quantity: 20, unit: 'meals', expiry: '', notes: '', imageData: '', imageName: '' });

  function selectImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Image must be 5MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageData: reader.result, imageName: file.name }));
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    if (!hasProfile) {
      notify('Complete your profile location before creating a listing');
      setView('profile-edit');
      return;
    }

    try {
      await api('/api/listings', {
        method: 'POST',
        body: {
          foodDetails: {
            title: form.title,
            quantity: Number(form.quantity),
            unit: form.unit,
            expiry: form.expiry,
            notes: form.notes
          },
          imageData: form.imageData || undefined
        }
      });
      notify('Listing created from your profile address');
      setForm({ title: '', quantity: 20, unit: 'meals', expiry: '', notes: '', imageData: '', imageName: '' });
      reload();
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className="create-listing-shell reveal">
      <PageTitle title="Create Listing" subtitle="Publish surplus food from your saved profile address." />
      <form className="create-listing-card form-grid glass" onSubmit={submit}>
        {!hasProfile && <div className="notice wide"><LockKeyhole size={18} /> Complete profile first. Address and coordinates are never entered manually.</div>}
        <label>Food title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Quantity<input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label>
        <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></label>
        <label>Expiry<input type="datetime-local" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} required /></label>
        <label className="wide">Pickup address<input value={readableAddress(savedAddress(user)) || 'Save profile address first'} readOnly /></label>
        <div className="image-upload wide">
          <div className="image-preview">
            <img src={form.imageData || fallbackFoodImage} alt="Food preview" />
          </div>
          <div className="image-actions">
            <strong>Upload Food Image</strong>
            <span>{form.imageName || 'Image is optional but recommended for faster NGO decisions.'}</span>
            <div>
              <label className="upload-button"><Upload size={16} /> Upload from device<input type="file" accept="image/*" onChange={(e) => selectImage(e.target.files?.[0])} /></label>
              <label className="upload-button"><Camera size={16} /> Click photo<input type="file" accept="image/*" capture="environment" onChange={(e) => selectImage(e.target.files?.[0])} /></label>
            </div>
          </div>
        </div>
        <label className="wide">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="form-actions wide">
          <button className="primary">Publish listing</button>
        </div>
      </form>
    </section>
  );
}

function ListingGrid({ user, listings, notify, reload, otpVault, saveOtps }) {
  if (!listings.length) {
    return <div className="empty glass"><ShieldCheck size={30} /><h3>No listings here</h3><p>MongoDB-backed updates will appear here in real time.</p></div>;
  }

  return (
    <div className="grid">
      {listings.map((listing) => (
        <ListingCard key={listing._id} user={user} listing={listing} notify={notify} reload={reload} otpVault={otpVault} saveOtps={saveOtps} />
      ))}
    </div>
  );
}

function ListingCard({ user, listing, notify, reload, otpVault, saveOtps }) {
  const food = listingFood(listing);
  const locations = listingLocations(listing);
  const invalidListing = !listing?._id || !listing?.stage || !locations.donor;
  const [otp, setOtp] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [smoothDriverLocation, setSmoothDriverLocation] = useState(listing.locations?.driver || null);
  const smoothDriverRef = useRef(normalizePoint(listing.locations?.driver));
  const markerAnimationRef = useRef(0);
  const gpsErrorShownRef = useRef(false);
  const [rating, setRating] = useState(5);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const active = ['picking', 'delivering'].includes(listing.stage);
  const listingOtp = otpVault?.[listing._id];
  const visibleOtp = listing.stage === 'picking' && listingOtp?.donorOtp
    ? { donorOtp: listingOtp.donorOtp }
    : listing.stage === 'delivering' && listingOtp?.collectorOtp
      ? { collectorOtp: listingOtp.collectorOtp }
      : null;
  const existingRating = listing.ratings?.find((item) => String(item.by?._id || item.by) === String(user.id));

  useEffect(() => {
    if (!active) return;
    const socket = getSocket();
    const joinEvent = user.role === 'DRIVER' ? 'driver:join' : 'user:join';
    socket.emit(joinEvent, { listingId: listing._id }, (response) => {
      if (!response?.ok) console.warn(`[tracking] ${joinEvent} failed`, response?.message);
      else console.log(`[tracking] ${joinEvent} joined`, listing._id);
    });

    function handleDriverLocation(event) {
      if (String(event.listingId) !== String(listing._id)) return;
      const next = driverPointFromEvent(event);
      if (!next) return;
      console.log('[tracking] driver location received', {
        listingId: event.listingId,
        lat: next.lat,
        lng: next.lng,
        heading: next.heading
      });
      setLiveDriverLocation(next);
    }

    socket.on('driver:location', handleDriverLocation);

    return () => {
      socket.emit('listing:leave', listing._id);
      socket.off('driver:location', handleDriverLocation);
    };
  }, [listing._id, active, user.role]);

  useEffect(() => {
    const next = normalizePoint(liveDriverLocation || listing.locations?.driver);
    if (!next) {
      window.cancelAnimationFrame(markerAnimationRef.current);
      smoothDriverRef.current = null;
      setSmoothDriverLocation(null);
      return undefined;
    }

    const start = smoothDriverRef.current || next;
    if (!smoothDriverRef.current) {
      smoothDriverRef.current = next;
      setSmoothDriverLocation(next);
      return undefined;
    }

    window.cancelAnimationFrame(markerAnimationRef.current);
    const startedAt = performance.now();

    function tick(now) {
      const progress = Math.min((now - startedAt) / markerAnimationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolated = {
        ...next,
        lat: start.lat + (next.lat - start.lat) * eased,
        lng: start.lng + (next.lng - start.lng) * eased
      };
      smoothDriverRef.current = interpolated;
      setSmoothDriverLocation(interpolated);
      if (progress < 1) markerAnimationRef.current = window.requestAnimationFrame(tick);
    }

    markerAnimationRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(markerAnimationRef.current);
  }, [liveDriverLocation?.lat, liveDriverLocation?.lng, listing.locations?.driver?.lat, listing.locations?.driver?.lng, active]);

  useEffect(() => {
    if (!active || user.role !== 'DRIVER') return undefined;
    if (!navigator.geolocation) {
      notify('Geolocation is not available on this device');
      return undefined;
    }
    let stopped = false;
    let lastSentAt = 0;
    const socket = getSocket();
    socket.emit('driver:join', { listingId: listing._id });

    function sendDriverLocation(pos) {
      if (stopped) return;
      const now = Date.now();
      if (now - lastSentAt < driverEmitIntervalMs) return;
      lastSentAt = now;
      const payload = {
        listingId: listing._id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading
      };
      console.log('[tracking] driver location emitted', payload);
      socket.emit('driver:location', payload, (response) => {
        if (!response?.ok && response?.message) notify(response.message);
      });
    }

    const watchId = navigator.geolocation.watchPosition(sendDriverLocation, (error) => {
      console.warn('[tracking] GPS error', error);
      if (!gpsErrorShownRef.current) {
        gpsErrorShownRef.current = true;
        notify(error.message || 'Unable to detect driver location');
      }
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 });

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active, user.role, listing._id]);

  useEffect(() => {
    if (existingRating) {
      setRating(existingRating.score || 5);
      setRatingComment(existingRating.comment || '');
      setRatingSubmitted(true);
    } else {
      setRatingSubmitted(false);
    }
  }, [existingRating?.score, existingRating?.comment]);

  async function action(path, body, message) {
    try {
      const data = await api(`/api/listings/${listing._id}/${path}`, { method: 'POST', body });
      if (data.listing?.donorOtp || data.listing?.collectorOtp) {
        saveOtps(listing._id, {
          ...(data.listing.donorOtp ? { donorOtp: data.listing.donorOtp } : {}),
          ...(data.listing.collectorOtp ? { collectorOtp: data.listing.collectorOtp } : {})
        });
        setOtpOpen(true);
      }
      notify(message);
      reload();
    } catch (err) {
      notify(err.message);
    }
  }

  async function cancelCurrentListing() {
    try {
      await api(`/api/listings/${listing._id}/cancel`, { method: 'POST', body: {} });
      notify('Listing cancelled');
      setDeleteOpen(false);
      reload();
    } catch (err) {
      notify(err.message);
    }
  }

  function toggleDetails(event) {
    if (event.target.closest('button, input, select, textarea, a, label')) return;
    setDetailsOpen((value) => !value);
  }

  async function submitRating() {
    try {
      await api(`/api/listings/${listing._id}/rate`, { method: 'POST', body: { score: rating, comment: ratingComment } });
      setRatingSubmitted(true);
      notify('Thank you for your feedback');
      reload();
    } catch (err) {
      notify(err.message);
    }
  }

  const canDelete = user.role === 'DONOR' && ['listed', 'connected', 'picking'].includes(listing.stage);

  if (invalidListing) {
    return <div className="empty glass"><ShieldCheck size={24} /><p>Listing data is incomplete.</p></div>;
  }

  return (
    <article
      className={`listing-card glass ${detailsOpen ? 'expanded' : ''}`}
      onClick={toggleDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setDetailsOpen((value) => !value);
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={detailsOpen}
    >
      <img className="listing-thumb" src={mediaUrl(food.imageUrl)} alt={food.title || 'Food listing'} />
      <div className="card-head">
        <div>
          <h3>{food.title || 'Untitled listing'}</h3>
          <p>{food.quantity || 0} {food.unit || 'meals'}</p>
        </div>
        <span className={`stage-badge stage-${listing.stage}`}>{stageLabels[listing.stage]}</span>
      </div>
      <div className="summary-address">
        <MapPin size={15} />
        <span>{locations.donor?.address || 'Address unavailable'}</span>
      </div>
      <StageTracker stage={listing.stage} />
      <div className="meta">
        <span><MapPin size={15} /> {locations.donor?.address || 'Address unavailable'}</span>
        {locations.collector?.address && <span><Users size={15} /> {locations.collector.address}</span>}
        {listing.driverId && <span><Truck size={15} /> {listing.driverId.name}</span>}
      </div>
      {active && <MapPanel listing={{ ...listing, locations: { ...listing.locations, driver: smoothDriverLocation || liveDriverLocation || listing.locations.driver } }} user={user} notify={notify} />}
      {user.role === 'COLLECTOR' && listing.stage === 'listed' && <button className="primary" onClick={() => action('accept-collector', {}, 'Listing connected')}>Accept listing</button>}
      {visibleOtp && <button className="secondary-action" onClick={() => setOtpOpen(true)}><Eye size={16} /> Show OTP</button>}
      {user.role === 'DRIVER' && listing.stage === 'connected' && <button className="primary" onClick={() => action('accept-driver', {}, 'Job accepted')}>Accept job</button>}
      {user.role === 'DRIVER' && listing.stage === 'picking' && <OtpAction otp={otp} setOtp={setOtp} label="Verify pickup" onSubmit={() => action('pickup', { otp }, 'Pickup verified')} />}
      {user.role === 'DRIVER' && listing.stage === 'delivering' && <OtpAction otp={otp} setOtp={setOtp} label="Verify delivery" onSubmit={() => action('delivery', { otp }, 'Delivery completed')} />}
      {['DONOR', 'COLLECTOR'].includes(user.role) && listing.stage === 'completed' && listing.driverId && (
        <RatingPanel
          rating={rating}
          hover={ratingHover}
          comment={ratingComment}
          submitted={ratingSubmitted}
          onHover={setRatingHover}
          onRate={setRating}
          onComment={setRatingComment}
          onSubmit={submitRating}
        />
      )}
      {canDelete && detailsOpen && (
        <button className="danger-action" onClick={(event) => { event.stopPropagation(); setDeleteOpen(true); }}>
          <Trash2 size={16} /> Cancel listing
        </button>
      )}
      {otpOpen && visibleOtp && <OtpModal otps={visibleOtp} onClose={() => setOtpOpen(false)} notify={notify} />}
      {deleteOpen && (
        <ConfirmModal
          title="Delete listing?"
          message="Are you sure you want to cancel this listing? Collector and driver will be notified."
          confirmLabel="Cancel listing"
          onConfirm={cancelCurrentListing}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </article>
  );
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="confirm-modal glass">
        <button className="close-button" onClick={onClose}><X size={18} /></button>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="secondary-action" onClick={onClose}>Cancel</button>
          <button className="danger-action" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function OtpModal({ otps, onClose, notify }) {
  async function copy(value) {
    await navigator.clipboard.writeText(value);
    notify('OTP copied');
  }

  return (
    <div className="modal-backdrop">
      <div className="otp-modal glass">
        <button className="close-button" onClick={onClose}><X size={18} /></button>
        <h3>Secure handoff OTPs</h3>
        <p>Share only with the assigned driver during pickup and delivery.</p>
        <div className="otp-grid">
          {otps.donorOtp && <div><span>Pickup OTP</span><strong>{otps.donorOtp}</strong><button onClick={() => copy(otps.donorOtp)}><Clipboard size={16} /> Copy</button></div>}
          {otps.collectorOtp && <div><span>Delivery OTP</span><strong>{otps.collectorOtp}</strong><button onClick={() => copy(otps.collectorOtp)}><Clipboard size={16} /> Copy</button></div>}
        </div>
      </div>
    </div>
  );
}

function OtpAction({ otp, setOtp, label, onSubmit }) {
  return <div className="inline-form"><input placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} /><button type="button" onClick={onSubmit}>{label}</button></div>;
}

function RatingPanel({ rating, hover, comment, submitted, onHover, onRate, onComment, onSubmit }) {
  const activeRating = hover || rating;

  if (submitted) {
    return (
      <div className="rating-panel submitted">
        <div>
          <strong>Thank you for your feedback</strong>
          <span>Your delivery experience rating has been saved.</span>
        </div>
        <div className="star-row readonly" aria-label={`Rated ${rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((score) => (
            <Star key={score} size={20} className={score <= rating ? 'active' : ''} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rating-panel">
      <div>
        <strong>Rate your delivery experience</strong>
        <span>Tap a star and add an optional note for the driver.</span>
      </div>
      <div className="star-row" role="radiogroup" aria-label="Rate your delivery experience">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            type="button"
            key={score}
            className={score <= activeRating ? 'active' : ''}
            onMouseEnter={() => onHover(score)}
            onMouseLeave={() => onHover(0)}
            onFocus={() => onHover(score)}
            onBlur={() => onHover(0)}
            onClick={() => onRate(score)}
            role="radio"
            aria-checked={rating === score}
            aria-label={`${score} star${score > 1 ? 's' : ''}`}
          >
            <Star size={24} />
          </button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(event) => onComment(event.target.value)}
        placeholder="Optional feedback"
        maxLength={160}
      />
      <button type="button" className="primary" onClick={onSubmit}>Submit rating</button>
    </div>
  );
}

function StageTracker({ stage }) {
  const activeIndex = stages.indexOf(stage);
  return (
    <div className="tracker">
      {stages.map((item, index) => (
        <div key={item} className={index <= activeIndex ? 'done' : ''}>
          <span>{index + 1}</span>
          <small>{item}</small>
        </div>
      ))}
    </div>
  );
}

function CollectorMapView({ user, listings, notify, reload, saveOtps, compact = false }) {
  const [selected, setSelected] = useState(null);

  async function accept(listing) {
    try {
      const data = await api(`/api/listings/${listing._id}/accept-collector`, { method: 'POST', body: {} });
      notify('Listing connected. Donor OTP is visible to the donor.');
      if (data.listing) setSelected(data.listing);
      reload();
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className={`collector-map-section ${compact ? 'compact' : ''}`}>
      <div className="section-title">
        <div>
          <h2>Nearby available food</h2>
          <span>Markers are powered by donor profile locations.</span>
        </div>
      </div>
      <ListingsMap listings={listings} selected={selected} onSelect={setSelected} user={user} />
      <div className="map-legend">
        <span><i className="legend-dot listed" /> Available</span>
        <span><i className="legend-dot connected" /> Accepted</span>
        <span><i className="legend-dot delivering" /> Delivering</span>
      </div>
      {selected && (
        <div className="map-preview glass">
          <img src={mediaUrl(selected.foodDetails?.imageUrl)} alt={selected.foodDetails?.title || 'Food listing'} />
          <div>
            <span className={`stage-badge stage-${selected.stage}`}>{stageLabels[selected.stage]}</span>
            <h3>{selected.foodDetails.title}</h3>
            <p>{selected.foodDetails.quantity} {selected.foodDetails.unit} from {selected.locations.donor.address}</p>
          </div>
          <CollectorRoutePreview user={user} listing={selected} />
          {selected.stage === 'listed' && <button className="primary" onClick={() => accept(selected)}>Accept from map</button>}
        </div>
      )}
    </section>
  );
}

function ListingsMap({ listings, selected, onSelect, user }) {
  const [hoveredListingId, setHoveredListingId] = useState(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'annseva-google-maps',
    googleMapsApiKey,
    libraries: googleLibraries
  });
  const userAddress = savedAddress(user);
  const safeListings = Array.isArray(listings) ? listings.filter((listing) => listing?.locations?.donor?.lat != null && listing?.locations?.donor?.lng != null) : [];
  const center = userAddress.lat != null
    ? { lat: userAddress.lat, lng: userAddress.lng }
    : safeListings[0]?.locations?.donor
      ? { lat: safeListings[0].locations.donor.lat, lng: safeListings[0].locations.donor.lng }
      : defaultCenter;

  if (!googleMapsApiKey || loadError) {
    return (
      <div className="marker-map-fallback glass">
        <span>{loadError ? 'Google Maps could not load. Check Maps JavaScript API, Geocoding API, and localhost key restrictions.' : 'Add VITE_GOOGLE_MAPS_API_KEY to enable the map.'}</span>
        {safeListings.length ? safeListings.map((listing) => (
          <button key={listing._id} className={selected?._id === listing._id ? 'selected' : ''} onClick={() => onSelect(listing)}>
            <MapPin size={18} />
            <span>{listing.foodDetails?.title || 'Food listing'}</span>
            <small>{listing.locations.donor.address || 'Address unavailable'}</small>
          </button>
        )) : <span>No available listings yet</span>}
      </div>
    );
  }

  if (!isLoaded) return <div className="collector-map-canvas"><span className="map-loading">Loading map...</span></div>;

  return (
    <GoogleMap mapContainerClassName="collector-map-canvas" center={center} zoom={12} options={mapOptions}>
      {safeListings.map((listing) => (
        <Marker
          key={listing._id}
          position={{ lat: listing.locations.donor.lat, lng: listing.locations.donor.lng }}
          title={listing.foodDetails?.title || 'Food listing'}
          icon={listingMarkerIcon(window.google, {
            active: selected?._id === listing._id,
            hover: hoveredListingId === listing._id,
            stage: listing.stage
          })}
          zIndex={selected?._id === listing._id || hoveredListingId === listing._id ? 20 : 10}
          onMouseOver={() => setHoveredListingId(listing._id)}
          onMouseOut={() => setHoveredListingId(null)}
          onClick={() => onSelect(listing)}
        />
      ))}
    </GoogleMap>
  );
}

function CollectorRoutePreview({ user, listing }) {
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState('');
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'annseva-google-maps',
    googleMapsApiKey,
    libraries: googleLibraries
  });
  const collector = normalizePoint(savedAddress(user));
  const donor = normalizePoint(listing?.locations?.donor);

  useEffect(() => {
    if (!isLoaded || loadError || !collector || !donor) return;
    const service = new window.google.maps.DirectionsService();
    setRouteError('');
    setRouteInfo(null);
    service.route({
      origin: { lat: collector.lat, lng: collector.lng },
      destination: { lat: donor.lat, lng: donor.lng },
      travelMode: window.google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === 'OK') {
        const leg = result.routes?.[0]?.legs?.[0];
        setRouteInfo({
          directions: result,
          distance: leg?.distance?.text,
          duration: leg?.duration?.text
        });
      } else {
        setRouteError('Approximate route shown');
      }
    });
  }, [isLoaded, loadError, collector?.lat, collector?.lng, donor?.lat, donor?.lng, listing?._id]);

  if (!collector || !donor) return <div className="route-preview-fallback">Save profile location to preview route.</div>;
  if (!googleMapsApiKey || loadError) return <div className="route-preview-fallback">Route preview needs Google Maps.</div>;
  if (!isLoaded) return <div className="route-preview-map"><span className="map-loading">Loading preview...</span></div>;

  return (
    <div className="route-preview">
      <div>
        <strong>{routeInfo?.distance || 'Approx route'}</strong>
        <span>{routeInfo?.duration || routeError || 'Calculating ETA...'}</span>
      </div>
      <GoogleMap
        mapContainerClassName="route-preview-map"
        center={{ lat: donor.lat, lng: donor.lng }}
        zoom={12}
        options={mapOptions}
      >
        {routeInfo?.directions ? (
          <DirectionsRenderer directions={routeInfo.directions} options={{ suppressMarkers: true, preserveViewport: false, polylineOptions: { strokeColor: '#16A34A', strokeWeight: 4 } }} />
        ) : (
          <Polyline path={[{ lat: collector.lat, lng: collector.lng }, { lat: donor.lat, lng: donor.lng }]} options={{ strokeColor: '#16A34A', strokeWeight: 4, strokeOpacity: 0.8 }} />
        )}
        <Marker position={{ lat: collector.lat, lng: collector.lng }} title="Collector" />
        <Marker position={{ lat: donor.lat, lng: donor.lng }} title="Donor" />
      </GoogleMap>
    </div>
  );
}

function MapPanel({ listing, user, notify }) {
  const target = activeRouteTarget(listing);
  const driver = normalizePoint(listing.locations.driver);
  const mapsUrl = target ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}` : '#';
  const routeLabel = listing.stage === 'picking' ? 'Driver to donor' : 'Driver to collector';

  return (
    <div className="map-panel">
      <div>
        <strong>{routeLabel}</strong>
        <span>{driver ? 'Driver is on the way' : 'Waiting for live driver location'}</span>
      </div>
      {user.role === 'DRIVER' && <button type="button"><Navigation size={16} /> Live GPS active</button>}
      {user.role === 'DRIVER' && <a className="map-link" href={mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>}
      <GoogleRouteMap listing={listing} />
    </div>
  );
}

function AddressPickerModal({ value, onSave, onClose, notify }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'annseva-google-maps',
    googleMapsApiKey,
    libraries: googleLibraries
  });
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const [step, setStep] = useState(value.lat != null ? 'details' : 'map');
  const [geocoding, setGeocoding] = useState(false);
  const [geoWarning, setGeoWarning] = useState('');
  const [placePredictions, setPlacePredictions] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesWarning, setPlacesWarning] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [draft, setDraft] = useState({
    fullAddress: value.fullAddress || '',
    houseFlat: value.houseFlat || '',
    area: value.area || '',
    landmark: value.landmark || '',
    label: value.label || 'Home',
    lat: value.lat ?? null,
    lng: value.lng ?? null
  });

  function ensurePlacesServices() {
    if (!window.google?.maps?.places) return false;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!placesServiceRef.current) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }
    return true;
  }

  function setCurrentLocation() {
    if (!navigator.geolocation) {
      notify('Geolocation is not available');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      pickPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
    });
  }

  async function pickPoint(point) {
    let fullAddress = '';
    setGeocoding(true);
    setGeoWarning('');
    setDraft((current) => ({ ...current, ...point }));
    if (window.google?.maps) {
      try {
        fullAddress = await reverseGeocodeWithRetry(window.google, point);
      } catch (err) {
        setGeoWarning('Address lookup did not return a match. Search and select an address below.');
      }
    } else {
      setGeoWarning('Address lookup needs Google Maps. Search is available when Places API loads.');
    }
    setDraft((current) => ({ ...current, ...point, fullAddress: fullAddress || current.fullAddress }));
    setGeocoding(false);
    setStep('details');
  }

  function handleAddressChange(value) {
    setAddressTouched(true);
    setDraft((current) => ({ ...current, fullAddress: value }));
  }

  function selectPrediction(prediction) {
    if (!ensurePlacesServices()) {
      setPlacesWarning('Places API is not ready yet.');
      return;
    }

    setPlacesLoading(true);
    setPlacesWarning('');
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['formatted_address', 'geometry', 'address_components']
      },
      (place, status) => {
        setPlacesLoading(false);
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          setPlacesWarning('Could not load this place. Try another suggestion.');
          return;
        }

        const area = place.address_components?.find((component) =>
          component.types.includes('sublocality') ||
          component.types.includes('locality') ||
          component.types.includes('administrative_area_level_2')
        )?.long_name;

        setDraft((current) => ({
          ...current,
          fullAddress: place.formatted_address || prediction.description,
          area: current.area || area || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        }));
        setPlacePredictions([]);
        setAddressTouched(false);
        setGeoWarning('');
      }
    );
  }

  useEffect(() => {
    if (!isLoaded || step !== 'details' || !addressTouched) return;
    const query = draft.fullAddress.trim();
    if (query.length < 3) {
      setPlacePredictions([]);
      return;
    }
    if (!ensurePlacesServices()) return;

    setPlacesLoading(true);
    setPlacesWarning('');
    const timeout = window.setTimeout(() => {
      const request = {
        input: query,
        types: ['geocode'],
        componentRestrictions: { country: 'in' }
      };
      const handlePredictions = (predictions, status, retried = false) => {
          setPlacesLoading(false);
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
            setPlacePredictions(predictions.slice(0, 5));
          } else if (!retried) {
            setPlacesLoading(true);
            autocompleteServiceRef.current.getPlacePredictions(
              { input: query, types: ['geocode'] },
              (fallbackPredictions, fallbackStatus) => handlePredictions(fallbackPredictions, fallbackStatus, true)
            );
          } else {
            setPlacePredictions([]);
            setPlacesWarning('No matching places found. Try typing area, landmark, or city name.');
          }
        };
      autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => handlePredictions(predictions, status));
    }, 280);

    return () => window.clearTimeout(timeout);
  }, [draft.fullAddress, isLoaded, step, addressTouched]);

  function predictionMain(prediction) {
    const main = prediction.structured_formatting?.main_text || prediction.description;
    const match = prediction.structured_formatting?.main_text_matched_substrings?.[0];
    if (!match) return <strong>{main}</strong>;
    const before = main.slice(0, match.offset);
    const hit = main.slice(match.offset, match.offset + match.length);
    const after = main.slice(match.offset + match.length);
    return <strong>{before}<mark>{hit}</mark>{after}</strong>;
  }

  function saveAddress() {
    if (draft.lat == null || draft.lng == null) {
      notify('Select a map location first');
      return;
    }
    if (!draft.houseFlat || !draft.area) {
      notify('House/Flat and Area are required');
      return;
    }
    onSave({ ...draft, fullAddress: draft.fullAddress || `${draft.area} (${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)})` });
  }

  return (
    <div className="modal-backdrop">
      <div className="address-modal glass">
        <button className="close-button" onClick={onClose}><X size={18} /></button>
        <div className="section-title">
          <div>
            <h2>Add Address</h2>
            <span>{step === 'map' ? 'Choose a pin location' : 'Confirm delivery address details'}</span>
          </div>
        </div>
        {step === 'map' ? (
          <div className="location-picker">
            <div className="picker-toolbar">
                <span>{geocoding ? 'Fetching address...' : draft.lat != null ? 'Location selected' : 'Drag pin or click on map'}</span>
              <button type="button" onClick={setCurrentLocation}><Navigation size={16} /> Use current location</button>
            </div>
            {googleMapsApiKey && !loadError && isLoaded ? (
              <GoogleMap
                mapContainerClassName="picker-map"
                center={draft.lat != null ? { lat: draft.lat, lng: draft.lng } : defaultCenter}
                zoom={draft.lat != null ? 15 : 11}
                options={mapOptions}
                onClick={(event) => {
                  if (!event.latLng) return;
                  pickPoint({ lat: event.latLng.lat(), lng: event.latLng.lng() });
                }}
              >
                {draft.lat != null && (
                  <Marker
                    position={{ lat: draft.lat, lng: draft.lng }}
                    draggable
                    onDragEnd={(event) => {
                      if (!event.latLng) return;
                      pickPoint({ lat: event.latLng.lat(), lng: event.latLng.lng() });
                    }}
                  />
                )}
              </GoogleMap>
            ) : googleMapsApiKey && !loadError ? (
              <div className="picker-map"><span className="map-loading">Loading map...</span></div>
            ) : (
              <div className="map-fallback">
                <MapPin size={24} />
                <span>{loadError ? 'Unable to load Google Maps. Check API key, Maps JavaScript API, and Geocoding API settings.' : 'Add VITE_GOOGLE_MAPS_API_KEY for map picking, or use current location.'}</span>
              </div>
            )}
            {draft.lat != null && <button className="primary" type="button" onClick={() => setStep('details')}>Continue</button>}
          </div>
        ) : (
          <div className="form-grid inner">
            {geoWarning && <div className="notice wide"><MapPin size={16} /> {geoWarning}</div>}
            <label className="wide address-autocomplete-field">
              Address search
              <input
                value={draft.fullAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="Search a real address or place"
                autoComplete="off"
              />
              {(placesLoading || placePredictions.length > 0 || placesWarning) && (
                <div className="places-dropdown">
                  {placesLoading && <div className="places-loading">Searching places...</div>}
                  {!placesLoading && placePredictions.map((prediction) => (
                    <button type="button" key={prediction.place_id} onClick={() => selectPrediction(prediction)}>
                      <MapPin size={16} />
                      <span>
                        {predictionMain(prediction)}
                        <small>{prediction.structured_formatting?.secondary_text}</small>
                      </span>
                    </button>
                  ))}
                  {!placesLoading && placesWarning && <div className="places-warning">{placesWarning}</div>}
                </div>
              )}
            </label>
            <label>House/Flat No<input value={draft.houseFlat} onChange={(e) => setDraft({ ...draft, houseFlat: e.target.value })} required /></label>
            <label>Area<input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} required /></label>
            <label>Landmark<input value={draft.landmark} onChange={(e) => setDraft({ ...draft, landmark: e.target.value })} /></label>
            <label>Label<select value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}>
              <option>Home</option>
              <option>Office</option>
              <option>Other</option>
            </select></label>
            <div className="wide modal-actions">
              <button type="button" className="secondary-action" onClick={() => setStep('map')}>Change pin</button>
              <button type="button" className="primary" onClick={saveAddress}>Use this address</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function reverseGeocodeWithRetry(google, point) {
  try {
    return await reverseGeocode(google, point);
  } catch (err) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    return reverseGeocode(google, point);
  }
}

function reverseGeocode(google, point) {
  return new Promise((resolve, reject) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: point }, (results, status) => {
      if (status === 'OK' && results?.[0]) resolve(results[0].formatted_address);
      else reject(new Error('Address not found'));
    });
  });
}

function GoogleRouteMap({ listing }) {
  const [error, setError] = useState('');
  const [directions, setDirections] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const latestDriverRef = useRef(null);
  const latestTargetRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'annseva-google-maps',
    googleMapsApiKey,
    libraries: googleLibraries
  });
  const target = activeRouteTarget(listing);
  const driver = normalizePoint(listing?.locations?.driver);

  latestDriverRef.current = driver;
  latestTargetRef.current = target;

  useEffect(() => {
    if (!isLoaded || !latestTargetRef.current || loadError) return undefined;
    let cancelled = false;

    function requestRoute() {
      const routeDriver = latestDriverRef.current;
      const routeTarget = latestTargetRef.current;
      if (!routeDriver || !routeTarget) {
        setDirections(null);
        setRouteInfo(null);
        return;
      }

      setError('');
      if (!directionsServiceRef.current) {
        directionsServiceRef.current = new window.google.maps.DirectionsService();
      }

      directionsServiceRef.current.route({
        origin: { lat: routeDriver.lat, lng: routeDriver.lng },
        destination: { lat: routeTarget.lat, lng: routeTarget.lng },
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (result, status) => {
        if (cancelled) return;
        if (status === 'OK') {
          const leg = result.routes?.[0]?.legs?.[0];
          setDirections(result);
          setRouteInfo(leg ? { distance: leg.distance?.text, duration: leg.duration?.text } : null);
        } else {
          setDirections(null);
          setRouteInfo({ distance: 'Approx route', duration: 'Live path estimate' });
          setError('Exact route unavailable. Showing direct path.');
        }
      });
    }

    requestRoute();
    const routeTimer = window.setInterval(requestRoute, routeRefreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(routeTimer);
    };
  }, [isLoaded, loadError, listing?._id, listing?.stage, target?.lat, target?.lng, driver?.lat, driver?.lng]);

  useEffect(() => {
    setError('');
    setRouteInfo(null);
    setDirections(null);
  }, [listing?._id, listing?.stage, target?.lat, target?.lng]);

  if (!googleMapsApiKey || !target) {
    return <div className="map-fallback"><Clock3 size={24} /><span>Route preview appears when Google Maps is configured.</span></div>;
  }
  if (loadError) return <div className="map-fallback"><Clock3 size={24} /><span>Google Maps could not load. Check your key and enabled APIs.</span></div>;
  if (!isLoaded) return <div className="map-canvas"><span className="map-loading">Loading route...</span></div>;

  return (
    <GoogleMap mapContainerClassName="map-canvas" center={driver ? { lat: driver.lat, lng: driver.lng } : { lat: target.lat, lng: target.lng }} zoom={13} options={mapOptions}>
      {routeInfo && (
        <div className="route-info-pill">
          <strong>{routeInfo.distance || 'Route'}</strong>
          <span>{routeInfo.duration || 'ETA unavailable'}</span>
        </div>
      )}
      {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true, preserveViewport: false, polylineOptions: { strokeColor: '#16A34A', strokeWeight: 5 } }} />}
      {!directions && driver && (
        <Polyline
          path={[{ lat: driver.lat, lng: driver.lng }, { lat: target.lat, lng: target.lng }]}
          options={{ strokeColor: '#16A34A', strokeWeight: 5, strokeOpacity: 0.82, geodesic: true }}
        />
      )}
      <Marker position={{ lat: target.lat, lng: target.lng }} title={listing.stage === 'picking' ? 'Donor pickup' : 'Collector delivery'} />
      {driver && (
        <Marker
          position={{ lat: driver.lat, lng: driver.lng }}
          title="Live driver"
          icon={driverVehicleIcon(window.google, driver.heading)}
        />
      )}
      {!driver && <div className="map-loading subtle">Waiting for driver location...</div>}
      {error && <div className="map-loading subtle">{error}</div>}
    </GoogleMap>
  );
}

function SkeletonGrid() {
  return <div className="grid">{[1, 2, 3].map((item) => <div className="skeleton glass" key={item} />)}</div>;
}
