import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AboutSection from '../components/landing/AboutSection.jsx';
import FeaturesSection from '../components/landing/FeaturesSection.jsx';
import HeroSection from '../components/landing/HeroSection.jsx';
import HowItWorksSection from '../components/landing/HowItWorksSection.jsx';

export default function LandingPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <AboutSection />
    </>
  );
}
