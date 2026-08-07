// Runs synchronously before first paint (rendered as the first thing in
// <head>) so the page never flashes the wrong theme on load. Falls back to
// the OS preference only on a visitor's very first visit — any explicit
// choice made via ThemeToggle.tsx is stored in localStorage and always wins
// after that.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
