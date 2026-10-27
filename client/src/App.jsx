import About from './components/About.jsx';
import Contact from './components/Contact.jsx';
import Experience from './components/Experience.jsx';
import Footer from './components/Footer.jsx';
import Hero from './components/Hero.jsx';
import InfoRow from './components/InfoRow.jsx';
import Navbar from './components/Navbar.jsx';
import Projects from './components/Projects.jsx';
import Skills from './components/Skills.jsx';
import useTheme from './hooks/useTheme.js';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  return (
    <>
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
