import { Accessibility, BookOpen, Database, FlaskConical, GraduationCap, LifeBuoy, MessageCircle, Settings, User } from 'lucide-react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/app/AppShell.jsx';
import ComingSoonPage from './components/app/ComingSoonPage.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import ConversationPage from './pages/ConversationPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LearnPage from './pages/LearnPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import QuickConnectPage from './pages/QuickConnectPage.jsx';
import TranslatorPage from './pages/TranslatorPage.jsx';
import VoiceToTextPage from './pages/VoiceToTextPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route element={<AppShell />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="translator" element={<TranslatorPage />} />
        <Route path="voice-to-text" element={<VoiceToTextPage />} />
        <Route path="quick-connect" element={<QuickConnectPage />} />
        <Route path="conversation" element={<ConversationPage />} />
        <Route
          path="learn/dictionary"
          element={
            <ComingSoonPage
              section="Learn"
              title="ISL Dictionary"
              description="Search Indian Sign Language vocabulary by word and category."
              icon={BookOpen}
            />
          }
        />
        <Route
          path="learn/lessons"
          element={
            <ComingSoonPage
              section="Learn"
              title="Guided Learning"
              description="Structured lessons, from beginner to intermediate, with progress saved to your account."
              icon={GraduationCap}
            />
          }
        />
        <Route
          path="learn/practice"
          element={
            <ComingSoonPage
              section="Learn"
              title="Practice Lab"
              description="Practise selected vocabulary with your camera. Feedback appears only when the recogniser supports it."
              icon={FlaskConical}
            />
          }
        />
        <Route
          path="contribute"
          element={
            <ComingSoonPage
              section="Contribute"
              title="Dataset Contribution"
              description="Research participation: consent, instructions and recording status."
              icon={Database}
            />
          }
        />
        <Route
          path="community"
          element={
            <ComingSoonPage
              section="Contribute"
              title="Community & Feedback"
              description="Send feedback about SignBridge and read updates from the project."
              icon={MessageCircle}
            />
          }
        />
        <Route
          path="help"
          element={
            <ComingSoonPage
              section="Account"
              title="Help & Support"
              description="Guides for using SignBridge and how to report a problem."
              icon={LifeBuoy}
            />
          }
        />
        <Route
          path="accessibility"
          element={
            <ComingSoonPage
              section="Account"
              title="Accessibility"
              description="Text size and motion options. Quick controls are also available in the top bar."
              icon={Accessibility}
            />
          }
        />
        <Route
          path="settings"
          element={
            <ComingSoonPage
              section="Account"
              title="Settings"
              description="Workspace and preference settings."
              icon={Settings}
            />
          }
        />
        <Route
          path="profile"
          element={
            <ComingSoonPage
              section="Account"
              title="Profile"
              description="Your profile. Accounts are not available yet."
              icon={User}
            />
          }
        />
      </Route>

    </Routes>
  );
}
