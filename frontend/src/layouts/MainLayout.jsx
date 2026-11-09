import { Outlet, useLocation } from 'react-router-dom';
import Footer from '../components/layout/Footer.jsx';
import Navbar from '../components/layout/Navbar.jsx';

const IMMERSIVE_ROUTES = ['/translator'];

export default function MainLayout() {
  const { pathname } = useLocation();
  const immersive = IMMERSIVE_ROUTES.includes(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      {!immersive && <Navbar />}
      <main className="flex-1">
        <Outlet />
      </main>
      {!immersive && <Footer />}
    </div>
  );
}
