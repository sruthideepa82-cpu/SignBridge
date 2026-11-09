import { Outlet } from 'react-router-dom';
import Footer from '../components/layout/Footer.jsx';
import Navbar from '../components/layout/Navbar.jsx';

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
