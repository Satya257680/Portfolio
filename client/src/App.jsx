import { useCallback, useEffect, useState } from 'react';
import About from './components/About.jsx';
import Contact from './components/Contact.jsx';
import Experience from './components/Experience.jsx';
import Footer from './components/Footer.jsx';
import Hero from './components/Hero.jsx';
import InfoRow from './components/InfoRow.jsx';
import Navbar from './components/Navbar.jsx';
import Projects from './components/Projects.jsx';
import Skills from './components/Skills.jsx';
import WelcomeLoader from './components/WelcomeLoader.jsx';
import useTheme from './hooks/useTheme.js';
import { markWelcomeSeen, restoreDeepLink, shouldShowWelcome } from './lib/welcome.js';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  // The portfolio renders underneath from the start; the welcome screen only covers it.
  const [welcome, setWelcome] = useState(shouldShowWelcome);
  const finishWelcome = useCallback(() => {
    markWelcomeSeen();
    setWelcome(false);
  }, []);

  // Open "/#section" deep links once the portfolio is visible (right away when no welcome screen).
  useEffect(() => {
    if (!welcome) restoreDeepLink();
  }, [welcome]);

  return (
    <>
      {welcome ? <WelcomeLoader onFinish={finishWelcome} /> : null}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar theme={theme} onToggleTheme={toggleTheme} />
      <main id="main">
        <Hero />
        <About />
        <Skills />
        <Experience />
        <Projects />
        <InfoRow />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
