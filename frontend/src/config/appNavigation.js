import {
  Accessibility,
  BookOpen,
  Database,
  FlaskConical,
  GraduationCap,
  Hand,
  HandHeart,
  Blocks,
  LayoutDashboard,
  LifeBuoy,
  Mic,
  MessageCircle,
  MessagesSquare,
  Radio,
  Settings,
  Zap,
} from 'lucide-react';

// One source for the sidebar, the command search and the breadcrumbs.
export const APP_SECTIONS = [
  {
    label: 'Communicate',
    icon: Radio,
    items: [
      { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Sign to Voice', to: '/translator', icon: Hand },
      { label: 'Voice to Text', to: '/voice-to-text', icon: Mic },
      { label: 'Quick Connect', to: '/quick-connect', icon: Zap },
      { label: 'Conversation Space', to: '/conversation', icon: MessagesSquare },
    ],
  },
  {
    label: 'Learn',
    icon: Blocks,
    items: [
      { label: 'ISL Dictionary', to: '/learn/dictionary', icon: BookOpen },
      { label: 'Guided Learning', to: '/learn/lessons', icon: GraduationCap },
      { label: 'Practice Lab', to: '/learn/practice', icon: FlaskConical },
    ],
  },
  {
    label: 'Contribute',
    icon: HandHeart,
    items: [
      { label: 'Dataset Contribution', to: '/contribute', icon: Database },
      { label: 'Community & Feedback', to: '/community', icon: MessageCircle },
    ],
  },
];

export const APP_FOOTER_ITEMS = [
  { label: 'Accessibility', to: '/accessibility', icon: Accessibility },
  { label: 'Help & Support', to: '/help', icon: LifeBuoy },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function findAppItem(pathname) {
  const all = [
    ...APP_SECTIONS.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label }))),
    ...APP_FOOTER_ITEMS.map((item) => ({ ...item, section: 'Account' })),
  ];
  return all.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? null;
}
