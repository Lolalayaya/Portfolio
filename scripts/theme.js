(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme-switch");
  if (!btn) return;
  var icon = btn.querySelector(".ts-icon") || btn;
  var spins = 0;

  function current() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function paint() {
    var isDark = current() === "dark";
    icon.textContent = isDark ? "☀︎" : "☾";
    btn.setAttribute("aria-label", isDark ? "切換為亮色模式" : "切換為深色模式");
  }

  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (error) {}
    paint();
    // Always spin forward by one more full turn — a transition retargets
    // smoothly from wherever it currently is, so rapid clicks never snap
    // back to 0deg the way restarting a keyframe animation would.
    spins += 1;
    icon.style.transform = "rotate(" + spins * 360 + "deg)";
  });

  paint();
})();
