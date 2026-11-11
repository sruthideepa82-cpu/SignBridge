import {
  Accessibility,
  Camera,
  GraduationCap,
  HeartHandshake,
  MessageSquareText,
  ScanLine,
  ShieldCheck,
  Type,
  Volume2,
} from 'lucide-react';

export const SECTION_LINKS = [
  { label: 'Features', to: '/#features' },
  { label: 'How It Works', to: '/#how-it-works' },
  { label: 'About', to: '/#about' },
];

export const ROUTE_LINKS = [
  { label: 'Live Studio', to: '/live' },
  { label: 'Learn', to: '/learn' },
];

export const FEATURES = [
  {
    icon: Camera,
    title: 'Real-Time Sign Recognition',
    description:
      'Recognize hand gestures from a webcam feed using MediaPipe and OpenCV. Webcam capture is already working; gesture recognition is the next milestone.',
    status: 'In development',
  },
  {
    icon: Type,
    title: 'Sign-to-Text Translation',
    description:
      'Convert recognized Indian Sign Language gestures into readable text for the person you are talking to.',
    status: 'Planned',
  },
  {
    icon: Volume2,
    title: 'Text-to-Speech',
    description:
      'Read translated text aloud so people who do not know sign language can follow the conversation.',
    status: 'Planned',
  },
  {
    icon: GraduationCap,
    title: 'Interactive Learning',
    description:
      'Practice Indian Sign Language with guided lessons and track your progress over time.',
    status: 'Planned',
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    icon: Camera,
    title: 'Enable your camera',
    description:
      'Start the webcam preview in the translator. The SignBridge backend captures frames with OpenCV.',
  },
  {
    icon: ScanLine,
    title: 'Recognize gestures',
    description:
      'Hand landmarks are detected and matched against Indian Sign Language gestures.',
  },
  {
    icon: MessageSquareText,
    title: 'Read the translation',
    description: 'Recognized signs appear as text in the conversation view.',
  },
  {
    icon: Volume2,
    title: 'Hear it spoken',
    description: 'The translated text is converted to speech for anyone nearby.',
  },
];

export const ABOUT_POINTS = [
  {
    icon: Accessibility,
    title: 'Accessibility first',
    description:
      'Built around the needs of Deaf and hard-of-hearing users and the people they talk with every day.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy-conscious by design',
    description:
      'The current camera feed is streamed only from your own backend, not sent to third-party services.',
  },
  {
    icon: HeartHandshake,
    title: 'Learning that grows with you',
    description:
      'A focus on Indian Sign Language, with lessons and progress tracking planned alongside translation.',
  },
];
