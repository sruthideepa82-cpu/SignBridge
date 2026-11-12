import { MessageCircle, User } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/app/AppShell.jsx';
import ComingSoonPage from './components/app/ComingSoonPage.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import ContributePage from './pages/ContributePage.jsx';
import DatasetCollectorPage from './pages/DatasetCollectorPage.jsx';
import FingerspellingPage from './pages/FingerspellingPage.jsx';
import ConversationDetailPage from './pages/ConversationDetailPage.jsx';
import ConversationsPage from './pages/ConversationsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DictionaryPage from './pages/DictionaryPage.jsx';
import GuidedLearningPage from './pages/GuidedLearningPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LearnPage from './pages/LearnPage.jsx';
import LearnSignsPage from './pages/LearnSignsPage.jsx';
import LiveStudioPage from './pages/LiveStudioPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import PracticeLabPage from './pages/PracticeLabPage.jsx';
import QuickPhrasesPage from './pages/QuickPhrasesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import VoiceToTextPage from './pages/VoiceToTextPage.jsx';

// Keeps bookmarks and links working after a page moved. The query string (for example ?category=) is kept.
function Moved({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

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
        <Route path="live" element={<LiveStudioPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="conversations/:conversationId" element={<ConversationDetailPage />} />
        <Route path="phrases" element={<QuickPhrasesPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="voice-to-text" element={<VoiceToTextPage />} />
        <Route path="learn/signs" element={<LearnSignsPage />} />
        <Route path="learn/dictionary" element={<DictionaryPage />} />
        <Route path="learn/lessons" element={<GuidedLearningPage />} />
        <Route path="learn/practice" element={<PracticeLabPage />} />
        <Route path="contribute" element={<ContributePage />} />
        <Route path="contribute/collector" element={<DatasetCollectorPage />} />
        <Route path="fingerspelling" element={<FingerspellingPage />} />
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
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
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

        <Route path="translator" element={<Moved to="/live" />} />
        <Route path="conversation" element={<Moved to="/conversations" />} />
        <Route path="quick-connect" element={<Moved to="/phrases" />} />
        <Route path="accessibility" element={<Moved to="/settings" />} />
      </Route>
    </Routes>
  );
}
