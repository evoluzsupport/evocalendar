// Update these URLs if your site uses different paths.
export const FOOTER_LINKS = {
  home: 'https://evoluz.tech',
  privacy: 'https://evoluz.tech/privacy-policy',
  terms: 'https://evoluz.tech/terms-of-service',
};

export default function SiteFooter() {
  return (
    <footer className="site-foot">
      <span>© {new Date().getFullYear()} OneCalendar</span>
      <nav className="site-foot-links" aria-label="Footer">
        <a href={FOOTER_LINKS.home}>Home</a>
        <a href={FOOTER_LINKS.privacy}>Privacy Policy</a>
        <a href={FOOTER_LINKS.terms}>Terms of Service</a>
      </nav>
    </footer>
  );
}
