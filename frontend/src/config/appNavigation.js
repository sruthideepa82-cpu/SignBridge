import {
  BookOpen,
  Database,
  Type,
  FlaskConical,
  GraduationCap,
  History,
  LayoutDashboard,
  LifeBuoy,
  Mic,
  MessageCircle,
  MessagesSquare,
  Settings,
  Video,
  Zap,
} from 'lucide-react';

// The dedicated workspace route for Live Studio. Public pages link here, and /live redirects to it.
export const LIVE_STUDIO_PATH = '/workspace/live-studio';

// The sidebar shows the six primary destinations. Other pages stay reachable from the Help page and search.
export const SIDEBAR_ITEMS = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Live Studio', to: LIVE_STUDIO_PATH, icon: Video },
  { label: 'Conversations', to: '/conversations', icon: MessagesSquare },
  { label: 'Quick Phrases', to: '/phrases', icon: Zap },
  { label: 'Learn Signs', to: '/learn/signs', icon: BookOpen },
  { label: 'History', to: '/history', icon: History },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export const APP_FOOTER_ITEMS = [
  { label: 'Settings', to: '/settings', icon: Settings },
  { label: 'Help & Support', to: '/help', icon: LifeBuoy },
];

export const APP_SECTIONS = [
  {
    label: 'Learn',
    items: [
      { label: 'ISL Dictionary', to: '/learn/dictionary', icon: BookOpen },
      { label: 'Guided Learning', to: '/learn/lessons', icon: GraduationCap },
      { label: 'Practice Lab', to: '/learn/practice', icon: FlaskConical },
    ],
  },
  {
    label: 'Contribute',
    items: [
      { label: 'Dataset Contribution', to: '/contribute', icon: Database },
      { label: 'Dataset Collector', to: '/contribute/collector', icon: Database },
      { label: 'Community & Feedback', to: '/community', icon: MessageCircle },
    ],
  },
];

export const APP_EXTRA_ITEMS = [
  { label: 'Voice to Text', to: '/voice-to-text', icon: Mic, section: 'Workspace' },
  { label: 'Fingerspelling', to: '/fingerspelling', icon: Type, section: 'Tools' },
];

export function allAppPages() {
  return [
    ...SIDEBAR_ITEMS.map((item) => ({ ...item, section: 'Workspace' })),
    ...APP_SECTIONS.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label }))),
    ...APP_EXTRA_ITEMS,
    { label: 'Help & Support', to: '/help', icon: LifeBuoy, section: 'Account' },
  ];
}

export function findAppItem(pathname) {
  return allAppPages().find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? null;
}
